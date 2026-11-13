"""The Studio service: routes, CORS, the body limit and the error body (spec 04 task 3.1).

No logic lives here. A route reads the body, checks it against the Service API Schema, takes a
rate-limit slot, and calls a function from the pipeline or from this package's own modules.

Run (from `pipeline/`):  uv run uvicorn buried_pipeline.service.app:create_app --factory
"""

from __future__ import annotations

import json
import logging
import os
import time
from collections.abc import Callable, Mapping
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from buried_pipeline.service import API_VERSION, SERVICE_VERSION
from buried_pipeline.service.config import Config
from buried_pipeline.service.errors import ServiceError
from buried_pipeline.service.extract import extract_region
from buried_pipeline.service.limits import Limiter
from buried_pipeline.service.logs import RedactingFilter
from buried_pipeline.service.publish import publish
from buried_pipeline.service.snapshot import PLATE_TYPE, Snapshot, load_snapshot
from buried_pipeline.timeutil import utc_now

log = logging.getLogger("buried.service")


class BodyLimit:
    """Refuse a request body over the limit (requirement 3.4): by its declared length when it has
    one, and by counting bytes as they arrive when it does not."""

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        declared = dict(scope["headers"]).get(b"content-length")
        too_large = ServiceError("too_large", f"the request body is over {self.max_bytes} bytes")
        if declared is not None and declared.isdigit() and int(declared) > self.max_bytes:
            await self._refuse(scope, receive, send, too_large)
            return
        seen = 0

        async def counted() -> Message:
            nonlocal seen
            message = await receive()
            if message["type"] == "http.request":
                seen += len(message.get("body", b""))
                if seen > self.max_bytes:
                    raise too_large
            return message

        try:
            await self.app(scope, counted, send)
        except ServiceError as exc:
            await self._refuse(scope, receive, send, exc)

    @staticmethod
    async def _refuse(scope: Scope, receive: Receive, send: Send, exc: ServiceError) -> None:
        await JSONResponse(exc.body(), status_code=exc.status)(scope, receive, send)


def client_address(request: Request) -> str:
    """The first X-Forwarded-For hop (set by the host's proxy), else the socket's address."""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded.strip():
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def create_app(
    config: Config | None = None,
    snapshot: Snapshot | None = None,
    limiter: Limiter | None = None,
    now: Callable[[], datetime] = utc_now,
    env: Mapping[str, str] | None = None,
) -> FastAPI:
    env = os.environ if env is None else env
    config = config or Config.from_env(env)
    snap = snapshot or load_snapshot(config.root, config.cache_dir, config.plate_manifest)
    limits = limiter or Limiter()
    for old in [f for f in log.filters if isinstance(f, RedactingFilter)]:
        log.removeFilter(old)  # one filter, for the app made last
    log.addFilter(RedactingFilter(env))

    app = FastAPI(title="Buried Studio service", version=SERVICE_VERSION,
                  docs_url=None, redoc_url=None, openapi_url=None)  # fmt: skip
    app.state.snapshot = snap
    app.state.config = config
    if config.allowed_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(config.allowed_origins),
            allow_methods=["GET", "POST", "DELETE"],
            allow_headers=["Content-Type"],
        )
    app.add_middleware(BodyLimit, max_bytes=config.max_body_bytes)

    @app.exception_handler(ServiceError)
    async def service_error(_request: Request, exc: ServiceError) -> JSONResponse:
        return JSONResponse(exc.body(), status_code=exc.status, headers=exc.headers)

    @app.exception_handler(Exception)
    async def unexpected(request: Request, exc: Exception) -> JSONResponse:
        # Only the kind of error and the route: never the body, the message or a traceback, which
        # can carry request content (requirement 3.8).
        log.error("unhandled %s on %s", type(exc).__name__, request.url.path)
        return JSONResponse(
            ServiceError("upstream_failed", "the Service failed on this request").body(),
            status_code=500,
        )

    @app.middleware("http")
    async def access_log(request: Request, call_next: Callable[[Request], Any]) -> Any:
        started = time.perf_counter()
        response = await call_next(request)
        log.info("%s %s %s %.0f ms", request.method, request.url.path, response.status_code,
                 (time.perf_counter() - started) * 1000)  # fmt: skip
        return response

    def respond(def_name: str, body: dict[str, Any], status: int = 200) -> JSONResponse:
        snap.contract.check_response(def_name, body)  # a response off-contract is our bug
        return JSONResponse(body, status_code=status)

    @app.get("/v1/health")
    async def health() -> JSONResponse:
        body: dict[str, Any] = {
            "api_version": API_VERSION,
            "service_version": SERVICE_VERSION,
            "data_version": snap.data_version,
            "label_provider": config.label_provider,
            "limits": limits.describe(),
        }
        if config.test_mode:
            body["test_mode"] = True
        return respond("healthResponse", body)

    @app.get("/v1/plates/registered")
    async def registered_plates() -> JSONResponse:
        plates = []
        for source in snap.registry.by_type(PLATE_TYPE):
            sidecar = snap.paths.tile_sidecar(source.id)
            plates.append({
                "source": snap.source_record(source.id),
                "tile_sidecar": _read_json(sidecar) if sidecar.is_file() else None,
                "has_alignment_record": snap.paths.alignment_record(source.id).is_file(),
                "has_map_area": snap.paths.map_area_file(source.id).is_file(),
                "raster_available": snap.listed_available(source.id),
                "plate_ref": snap.listed_ref(source.id),
            })  # fmt: skip
        return respond("registeredPlatesResponse", {
            "api_version": API_VERSION, "data_version": snap.data_version, "plates": plates,
        })  # fmt: skip

    @app.post("/v1/extract")
    async def extract(request: Request) -> JSONResponse:
        limits.hit("extract", client_address(request))
        body = snap.contract.request("extractRequest", await request.body(), snap.data_version)

        def work() -> dict[str, Any]:
            with limits.extraction_slot():
                return extract_region(snap, body)

        return respond("extractResponse", await run_in_threadpool(work))

    @app.post("/v1/publish")
    async def publish_route(request: Request) -> JSONResponse:
        limits.hit("match_publish", client_address(request))
        body = snap.contract.request("publishRequest", await request.body(), snap.data_version)
        result = await run_in_threadpool(publish, snap, body, now())
        return respond("publishResponse", result)

    return app


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))
