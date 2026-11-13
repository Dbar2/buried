"""The `buried-evidence` MCP server: a read-only stdio server over the committed Buried files.

It speaks the Model Context Protocol's JSON-RPC 2.0 over standard input and output, one JSON
message per line, which is all a tools-only server needs: `initialize`, `ping`, `tools/list` and
`tools/call`. It is written here so the pipeline gains no dependency. Standard output carries
protocol messages only; anything else goes to standard error.

Run: `uv --directory pipeline run python -m buried_pipeline.mcp` (`BURIED_REPO_ROOT` overrides the
repository root; the default is the nearest ancestor with `.kiro/`).

Every tool is read-only and returns facts as the files state them. Dates, "on this lot" and
confidence wording belong to the Evidence Library, so no tool computes them.
"""

from __future__ import annotations

import json
import os
import sys
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import IO, Any

from buried_pipeline import __version__
from buried_pipeline.mcp.store import MAX_RESULT_BYTES, BadRequest, EvidenceStore, NotFound
from buried_pipeline.paths import find_repo_root

SERVER_NAME = "buried-evidence"
SUPPORTED_PROTOCOLS = ("2025-06-18", "2025-03-26", "2024-11-05")

# JSON-RPC error codes.
PARSE_ERROR, INVALID_REQUEST, METHOD_NOT_FOUND, INVALID_PARAMS = -32700, -32600, -32601, -32602

Json = dict[str, Any]
Handler = Callable[[EvidenceStore, Json], Json]

READ_ONLY = {"readOnlyHint": True, "destructiveHint": False, "openWorldHint": False}


def _tool(
    name: str, description: str, properties: Json, required: list[str] | None = None
) -> Json:
    return {
        "name": name,
        "description": description,
        "inputSchema": {
            "type": "object",
            "properties": properties,
            "required": required or [],
            "additionalProperties": False,
        },
        "annotations": READ_ONLY,
    }


STR = {"type": "string"}
NUM = {"type": "number"}
LIMIT = {"type": "integer", "minimum": 1, "maximum": 200}
CURSOR = {**STR, "description": "next_cursor from the previous page; omit for the first page"}
PAGING_NOTE = (
    " Results are paged and never pass 20 KB: the result states total, returned, more and "
    "next_cursor."
)

TOOLS: list[Json] = [
    _tool(
        "find_places",
        "Find the finds in data/finds.json (a building or yard the plans letter on the block) and "
        "present-day addresses (City of Toronto address points) whose text contains every word "
        "of the query, or a lot by its parcel id. A find comes with its slug, tag, noun, and "
        "each reading: the plan's source id, the feature id, the lettering as read, the crop, "
        "who read it and when, the feature's status, and the feature's review state "
        "(provenance.review: reviewed, draft_rule or draft_hand, with by and on when reviewed). "
        "An address comes with the lots whose polygon contains its point. Finds are listed "
        "before addresses under one cursor. Coordinates are EPSG:26917 metres." + PAGING_NOTE,
        {"query": {**STR, "description": "Words from a find's tag or lettering, an address "
                   "such as '75 sumach', or a parcel id"},
         "limit": LIMIT, "cursor": CURSOR},
        ["query"],
    ),
    _tool(
        "features_near",
        "List evidence features (buildings, water, land use) within distance_m metres of a lot, "
        "an address point or a point, nearest first. The full form gives each feature's "
        "observations, confidence and its reason, position error, provenance, same_as links and "
        "source ids. compact true gives one short row per feature under a shared columns list "
        "(id, kind, confidence, area_m2, centroid, crop_px, has_storeys, confirmed_by, same_as) "
        "so about 100 fit in one page: crop_px is [x, y, width, height] in source pixels, "
        "centroid is [easting, northing] in EPSG:26917 metres, confirmed_by is an index into "
        "the result's reviewers list, same_as is a count; rows are in key rows, not features. "
        "source keeps one evidence file's features. Give exactly one of lot_id, address_id, or "
        "easting with northing. Distances are plain geometry; this does not say a feature is "
        "'on' a lot." + PAGING_NOTE,
        {"lot_id": STR, "address_id": STR, "easting": NUM, "northing": NUM,
         "distance_m": {"type": "number", "minimum": 0, "maximum": 5000},
         "status": {"type": "array", "items": STR,
                    "description": "Feature statuses to include; default ['published']"},
         "source": {**STR, "description": "Only features of this origin source id"},
         "compact": {"type": "boolean", "description": "Short rows; default false"},
         "limit": LIMIT, "cursor": CURSOR},
    ),
    _tool(
        "plate_features",
        "Every feature published from one source (default status published), in the short form "
        "of features_near compact (columns and rows), sorted by id, with a last column "
        "inside_control_hull: whether the feature's centroid lies inside the convex hull of "
        "the plate's control points, from the alignment record (null when the record has no "
        "hull). Also the counts inside and outside." + PAGING_NOTE,
        {"source_id": STR,
         "status": {"type": "array", "items": STR,
                    "description": "Feature statuses to include; default ['published']"},
         "limit": LIMIT, "cursor": CURSOR},
        ["source_id"],
    ),
    _tool(
        "list_sources",
        "List registered sources with years, URL, licence note, attribution line, rights check "
        "date and whether the source is held out. Optionally one source, or one type "
        "(fire_insurance_plan, aerial_photograph, present_day_reference, historical_map).",
        {"source_id": STR, "source_type": STR},
    ),
    _tool(
        "plate_alignment",
        "A plate's alignment record: control points and residuals, the in-sample and "
        "leave-one-out error, the chosen transform, the alignment error in metres, and the "
        "control hull inside which that error was measured.",
        {"source_id": STR},
        ["source_id"],
    ),
    _tool(
        "plate_work",
        "Summarise work in progress for a plate under data/work/: its extraction proposals "
        "(count, tone classes, weakness flags, score quartiles), the flagged proposals one by "
        "one (id, flags, score, area, crop rectangle), and its reviewer decisions (count by "
        "kind, reviewed areas, who confirmed). Says so when there is none." + PAGING_NOTE,
        {"source_id": STR, "limit": LIMIT, "cursor": CURSOR},
        ["source_id"],
    ),
]


HANDLERS: dict[str, Handler] = {
    "find_places": lambda s, a: s.find_places(a.get("query"), a.get("limit"), a.get("cursor")),
    "features_near": lambda s, a: s.features_near(a),
    "plate_features": lambda s, a: s.plate_features(
        a.get("source_id"), a.get("limit"), a.get("cursor"), a.get("status")
    ),
    "list_sources": lambda s, a: s.list_sources(a.get("source_id"), a.get("source_type")),
    "plate_alignment": lambda s, a: s.alignment(a.get("source_id")),
    "plate_work": lambda s, a: s.plate_work(a.get("source_id"), a.get("limit"), a.get("cursor")),
}


def _check_arguments(tool: Json, args: Any) -> str | None:
    """A message when the arguments do not fit the tool's schema, else None. Checks the parts of
    the schema the tools use: an object, known names only, required names, simple types."""
    if not isinstance(args, dict):
        return "arguments must be an object"
    schema = tool["inputSchema"]
    props = schema["properties"]
    unknown = sorted(set(args) - set(props))
    if unknown:
        return f"unknown arguments: {', '.join(unknown)}"
    missing = [r for r in schema["required"] if r not in args]
    if missing:
        return f"missing arguments: {', '.join(missing)}"
    for name, value in args.items():
        kind = props[name].get("type")
        ok = {
            "string": isinstance(value, str),
            "number": isinstance(value, int | float) and not isinstance(value, bool),
            "integer": isinstance(value, int) and not isinstance(value, bool),
            "boolean": isinstance(value, bool),
            "array": isinstance(value, list),
        }.get(kind, True)
        if not ok:
            return f"{name} must be a {kind}"
    return None


class Server:
    def __init__(self, store: EvidenceStore) -> None:
        self.store = store
        self.tools = {t["name"]: t for t in TOOLS}

    def call_tool(self, name: str, arguments: Any) -> Json:
        """A `tools/call` result: the facts as JSON text, or `isError` with the reason."""
        tool = self.tools.get(name)
        if tool is None:
            return _result_text(f"unknown tool {name!r}", error=True)
        problem = _check_arguments(tool, {} if arguments is None else arguments)
        if problem:
            return _result_text(problem, error=True)
        try:
            payload = HANDLERS[name](self.store, {} if arguments is None else arguments)
        except (BadRequest, NotFound) as exc:
            return _result_text(str(exc), error=True)
        except (OSError, json.JSONDecodeError, KeyError) as exc:
            return _result_text(f"could not read the committed files: {exc!r}", error=True)
        text = json.dumps(payload, separators=(",", ":"), sort_keys=True, ensure_ascii=False)
        size = len(text.encode("utf-8"))
        if size > MAX_RESULT_BYTES:
            return _result_text(
                f"the result is {size} bytes, over the {MAX_RESULT_BYTES} byte limit, and this "
                "tool has no paging. Ask for less (one source, one type).",
                error=True,
            )
        return _result_text(text)

    def handle(self, message: Any) -> Json | None:
        """One JSON-RPC message in, the response out (None for a notification)."""
        if not isinstance(message, Mapping) or message.get("jsonrpc") != "2.0":
            return _error(None, INVALID_REQUEST, "not a JSON-RPC 2.0 message")
        method, request_id = message.get("method"), message.get("id")
        if not isinstance(method, str):
            return None  # a response to a request this server never made
        if "id" not in message:
            return None  # notification: initialized, cancelled, and so on
        params = message.get("params") or {}
        if not isinstance(params, Mapping):
            return _error(request_id, INVALID_PARAMS, "params must be an object")
        if method == "initialize":
            wanted = params.get("protocolVersion")
            version = wanted if wanted in SUPPORTED_PROTOCOLS else SUPPORTED_PROTOCOLS[0]
            return _ok(
                request_id,
                {
                    "protocolVersion": version,
                    "capabilities": {"tools": {"listChanged": False}},
                    "serverInfo": {"name": SERVER_NAME, "version": __version__},
                    "instructions": (
                        "Read-only facts from Buried's committed evidence, sources and "
                        "alignment files. It computes no date windows, no 'on this lot' and no "
                        "confidence wording; those belong to the Evidence Library."
                    ),
                },
            )
        if method == "ping":
            return _ok(request_id, {})
        if method == "tools/list":
            return _ok(request_id, {"tools": TOOLS})
        if method == "tools/call":
            name = params.get("name")
            if not isinstance(name, str):
                return _error(request_id, INVALID_PARAMS, "tools/call needs a tool name")
            return _ok(request_id, self.call_tool(name, params.get("arguments")))
        return _error(request_id, METHOD_NOT_FOUND, f"method not found: {method}")


def _ok(request_id: Any, result: Json) -> Json:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def _error(request_id: Any, code: int, message: str) -> Json:
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


def _result_text(text: str, *, error: bool = False) -> Json:
    return {"content": [{"type": "text", "text": text}], "isError": error}


def serve(server: Server, stdin: IO[str], stdout: IO[str]) -> None:
    """Read one JSON message per line until the input ends."""
    for line in stdin:
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            response: Json | None = _error(None, PARSE_ERROR, "parse error")
        else:
            if isinstance(message, list):  # batches are not part of this server
                response = _error(None, INVALID_REQUEST, "batches are not supported")
            else:
                response = server.handle(message)
        if response is not None:
            stdout.write(json.dumps(response, separators=(",", ":"), ensure_ascii=False) + "\n")
            stdout.flush()


def repo_root() -> Path:
    env = os.environ.get("BURIED_REPO_ROOT")
    return Path(env).resolve() if env else find_repo_root()


def main() -> int:
    server = Server(EvidenceStore(repo_root()))
    serve(server, sys.stdin, sys.stdout)
    return 0
