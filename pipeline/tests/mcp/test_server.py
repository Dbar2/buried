from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

from buried_pipeline.mcp.server import SUPPORTED_PROTOCOLS, TOOLS, Server
from buried_pipeline.mcp.store import EvidenceStore

TOOL_NAMES = ["find_places", "features_near", "list_sources", "plate_alignment", "plate_work"]


def rpc(method: str, params: dict[str, Any] | None = None, id: int | None = 1) -> dict[str, Any]:
    message: dict[str, Any] = {"jsonrpc": "2.0", "method": method}
    if id is not None:
        message["id"] = id
    if params is not None:
        message["params"] = params
    return message


@pytest.fixture
def server(repo: Path) -> Server:
    return Server(EvidenceStore(repo))


def test_initialize_negotiates_the_protocol_and_offers_tools(server: Server) -> None:
    out = server.handle(rpc("initialize", {"protocolVersion": "2024-11-05"}))
    assert out is not None
    assert out["result"]["protocolVersion"] == "2024-11-05"
    assert out["result"]["serverInfo"]["name"] == "buried-evidence"
    assert "tools" in out["result"]["capabilities"]
    unknown = server.handle(rpc("initialize", {"protocolVersion": "1999-01-01"}))
    assert unknown is not None and unknown["result"]["protocolVersion"] == SUPPORTED_PROTOCOLS[0]


def test_notifications_get_no_answer(server: Server) -> None:
    assert server.handle(rpc("notifications/initialized", id=None)) is None


def test_every_tool_is_read_only_and_has_a_closed_schema() -> None:
    assert [t["name"] for t in TOOLS] == TOOL_NAMES
    for tool in TOOLS:
        assert tool["annotations"]["readOnlyHint"] is True
        assert tool["inputSchema"]["additionalProperties"] is False
        assert tool["description"]


def test_tools_call_returns_the_facts_as_json_text(server: Server) -> None:
    out = server.handle(rpc("tools/call", {"name": "list_sources", "arguments": {}}))
    assert out is not None
    result = out["result"]
    assert result["isError"] is False
    body = json.loads(result["content"][0]["text"])
    assert [s["id"] for s in body["sources"]] == ["fip_v3_1911_229", "fip_v3_1935_232"]


@pytest.mark.parametrize(
    ("name", "arguments", "text"),
    [
        ("nope", {}, "unknown tool"),
        ("find_places", {}, "missing arguments: query"),
        ("find_places", {"query": 5}, "must be a string"),
        ("find_places", {"query": "x", "extra": 1}, "unknown arguments: extra"),
        ("features_near", {"lot_id": "ZZ"}, "no lot ZZ"),
        ("features_near", {"lot_id": "L1", "limit": True}, "must be a integer"),
        ("plate_alignment", {"source_id": "BAD ID"}, "snake_case"),
        ("plate_work", "not an object", "must be an object"),
    ],
)
def test_tool_errors_are_results_not_crashes(
    server: Server, name: str, arguments: Any, text: str
) -> None:
    out = server.handle(rpc("tools/call", {"name": name, "arguments": arguments}))
    assert out is not None
    assert out["result"]["isError"] is True
    assert text in out["result"]["content"][0]["text"]


def test_protocol_errors(server: Server) -> None:
    bad = server.handle(rpc("nothing/here"))
    assert bad is not None and bad["error"]["code"] == -32601
    not_rpc = server.handle({"hello": 1})
    assert not_rpc is not None and not_rpc["error"]["code"] == -32600
    no_name = server.handle(rpc("tools/call", {}))
    assert no_name is not None and no_name["error"]["code"] == -32602


def talk(repo: Path, lines: list[str]) -> list[dict[str, Any]]:
    env = {**os.environ, "BURIED_REPO_ROOT": str(repo)}
    done = subprocess.run(
        [sys.executable, "-m", "buried_pipeline.mcp"],
        input="\n".join(lines) + "\n", capture_output=True, text=True, env=env, timeout=60,
        check=False,
    )  # fmt: skip
    assert done.returncode == 0, done.stderr
    return [json.loads(line) for line in done.stdout.splitlines()]


def test_the_server_starts_and_lists_its_tools(repo: Path) -> None:
    replies = talk(
        repo,
        [
            json.dumps(rpc("initialize", {"protocolVersion": "2025-06-18"}, 1)),
            json.dumps(rpc("notifications/initialized", id=None)),
            json.dumps(rpc("tools/list", id=2)),
            "not json",
            json.dumps(rpc("tools/call", {"name": "plate_alignment",
                                          "arguments": {"source_id": "fip_v3_1911_229"}}, 3)),
        ],
    )  # fmt: skip
    assert [r.get("id") for r in replies] == [1, 2, None, 3]
    assert [t["name"] for t in replies[1]["result"]["tools"]] == TOOL_NAMES
    assert replies[2]["error"]["code"] == -32700
    assert json.loads(replies[3]["result"]["content"][0]["text"])["record"]["chosen"] == "supplied"
