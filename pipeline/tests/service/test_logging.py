"""Request content and credentials never reach the log (spec 04 task 3.3, requirement 3.8)."""

from __future__ import annotations

import logging

import pytest

from buried_pipeline.service.logs import RedactingFilter
from tests.service.helpers import ServiceWorld, client_for, make_service_world
from tests.service.test_app import decisions_for, publish_body

MARKER = "BODY-MARKER-4f1c9"
SECRET = "s3cr3t-access-key-value"


@pytest.fixture(scope="module")
def sw(tmp_path_factory: pytest.TempPathFactory) -> ServiceWorld:
    return make_service_world(tmp_path_factory.mktemp("service_logging"))


def test_bodies_and_credentials_do_not_reach_the_log(
    sw: ServiceWorld, caplog: pytest.LogCaptureFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    caplog.set_level(logging.DEBUG)
    env = {"AWS_SECRET_ACCESS_KEY": SECRET, "AWS_ACCESS_KEY_ID": "AKIAEXAMPLE0000"}
    client = client_for(sw, env=env)

    client.post("/v1/extract", json={"note": MARKER})  # 422: a body that fails the schema
    client.post("/v1/extract", content=(MARKER * 500).encode())  # 422: not JSON at all

    def boom(*_a: object, **_k: object) -> None:
        raise RuntimeError(f"{MARKER} {SECRET}")  # an unexpected error that quotes both

    monkeypatch.setattr("buried_pipeline.service.app.publish", boom)
    body = publish_body(sw, f'{{"note": "{MARKER}"}}\n', decisions_for({"features": []}))
    assert client.post("/v1/publish", json=body).status_code == 500

    text = caplog.text + "\n".join(r.getMessage() for r in caplog.records)
    assert "POST /v1/extract 422" in text  # the log is not empty, so the absence means something
    assert "unhandled RuntimeError on /v1/publish" in text
    assert MARKER not in text and SECRET not in text and "AKIAEXAMPLE0000" not in text
    assert not any(r.exc_info for r in caplog.records if r.name == "buried.service")


def test_the_500_body_does_not_echo_the_error(
    sw: ServiceWorld, monkeypatch: pytest.MonkeyPatch
) -> None:
    def boom(*_a: object, **_k: object) -> None:
        raise RuntimeError(MARKER)

    monkeypatch.setattr("buried_pipeline.service.app.publish", boom)
    body = publish_body(sw, "{}\n", decisions_for({"features": []}))
    r = client_for(sw).post("/v1/publish", json=body)
    assert r.status_code == 500 and MARKER not in r.text


def make_record(msg: object, args: tuple[object, ...] = ()) -> logging.LogRecord:
    return logging.LogRecord("buried.service", logging.INFO, __file__, 1, msg, args, None)


def test_the_filter_replaces_bytes_long_text_and_secrets() -> None:
    f = RedactingFilter({"AWS_SECRET_ACCESS_KEY": SECRET})
    record = make_record("got %s %s %s", (b"x" * 5000, "y" * 5000, f"key {SECRET}"))
    assert f.filter(record)
    text = record.getMessage()
    assert "5000 bytes" in text and "5000 characters" in text
    assert SECRET not in text and "[redacted]" in text


def test_the_filter_drops_tracebacks() -> None:
    f = RedactingFilter({})
    try:
        raise ValueError(MARKER)
    except ValueError:
        import sys

        record = make_record("failed")
        record.exc_info = sys.exc_info()
    f.filter(record)
    assert record.exc_info is None
