"""The Service holds no precomputed result for the held-out plate, or for any plate
(spec 04 task 3.4, requirements 1.5, 17.1 to 17.3, 19.1).

Three guards: the Docker build context carries no result, the extract route runs the extraction on
every call, and no source file of the Service names the held-out plate.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

import pathspec
import pytest

from buried_pipeline.paths import find_repo_root
from tests.service.helpers import (
    ServiceWorld,
    client_for,
    extract_body,
    make_service_world,
    use_synthetic_params,
)

ROOT = find_repo_root(Path(__file__))
HELD_OUT = "fip_v3_1935_232"
IGNORE_FILE = ROOT / "pipeline" / "Dockerfile.dockerignore"
SKIP_DIRS = {".venv", ".hypothesis", ".pytest_cache", ".ruff_cache", "__pycache__", "node_modules",
             ".git"}  # fmt: skip


def ignore_spec() -> pathspec.GitIgnoreSpec:
    return pathspec.GitIgnoreSpec.from_lines(IGNORE_FILE.read_text().splitlines())


def build_context_files() -> list[str]:
    """Every file under pipeline/ and data/ that the ignore rules let into the build context. The
    other top-level directories (web, unity, docs, .kiro, tools) are checked by pattern below."""
    spec = ignore_spec()
    context: list[str] = []
    for top in ("pipeline", "data"):
        for dirpath, dirnames, filenames in os.walk(ROOT / top):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            for name in filenames:
                rel = (Path(dirpath) / name).relative_to(ROOT).as_posix()
                if not spec.match_file(rel):
                    context.append(rel)
    return sorted(context)


CONTEXT = build_context_files()

ALLOWED = [
    re.compile(p)
    for p in (
        r"pipeline/pyproject\.toml",
        r"pipeline/uv\.lock",
        r"pipeline/buried_pipeline/.+",
        r"data/(project|sources)\.json",
        r"data/schema/(evidence|studio_api)\.schema\.json",
        r"data/evidence/[^/]+\.geojson",
        r"data/present/[^/]+\.geojson",
        r"data/control/[^/]+\.json",
        r"data/control/map_area/[^/]+\.json",
        r"data/alignment/[^/]+\.json",
        r"data/tiles/[^/]+\.json",
    )
]


def test_the_build_context_holds_only_the_include_list() -> None:
    stray = [f for f in CONTEXT if not any(p.fullmatch(f) for p in ALLOWED)]
    assert stray == []
    assert "pipeline/buried_pipeline/service/app.py" in CONTEXT
    assert "data/sources.json" in CONTEXT


@pytest.mark.parametrize(
    "path",
    [
        "data/raw/fip_v3_1935_232/v3-1935-232.jpg",
        "data/work/proposals/fip_v3_1935_232.geojson",
        "data/work/extract/fip_v3_1935_232_preview.jpg",
        "data/work/review/fip_v3_1935_232.json",
        "data/tiles/fip_v3_1935_232.jpg",
        "data/tiles/fip_v3_1911_229_full.jpg",
        "pipeline/tests/fixtures/extract/anything/crop.png",
        "pipeline/tests/service/test_held_out_service.py",
        "web/public/data/tiles/fip_v3_1935_232.jpg",
        "docs/concept-brief.md",
        ".kiro/specs/04-studio/tasks.md",
        "unity/Assets/anything.cs",
        "data/schema/fixtures/valid/source/plate.json",
        "data/schema/studio_api_fixtures/valid/healthResponse/test_mode.json",
    ],
)
def test_nothing_that_could_be_a_result_is_in_the_context(path: str) -> None:
    assert ignore_spec().match_file(path), f"{path} would enter the build context"


def test_no_path_in_the_context_names_the_held_out_plate() -> None:
    assert [f for f in CONTEXT if "232" in f] == []


def test_the_dockerfile_copies_only_what_the_context_carries() -> None:
    text = (ROOT / "pipeline" / "Dockerfile").read_text()
    copies = re.findall(r"^COPY (?:--\S+ )*(\S+)", text, flags=re.MULTILINE)
    assert set(copies) <= {"/uv", "pipeline/pyproject.toml", "pipeline/buried_pipeline", "data"}
    assert "232" not in text and "data/raw" not in text and "data/work" not in text


def test_no_source_file_of_the_service_names_the_held_out_plate() -> None:
    offenders = [
        p.relative_to(ROOT).as_posix()
        for p in (ROOT / "pipeline" / "buried_pipeline").rglob("*.py")
        if "service" in p.parts and "232" in p.read_text(encoding="utf-8")
    ]
    assert offenders == []


# --- the extract route has no stored-result path ----------------------------------------------------


@pytest.fixture(scope="module")
def sw(tmp_path_factory: pytest.TempPathFactory) -> ServiceWorld:
    return make_service_world(tmp_path_factory.mktemp("service_held_out"))


def test_each_extract_call_runs_the_extraction(
    sw: ServiceWorld, monkeypatch: pytest.MonkeyPatch
) -> None:
    use_synthetic_params(monkeypatch)
    calls: list[str] = []
    real = __import__("buried_pipeline.service.extract", fromlist=["extract_document"]).extract_document

    def spy(*args, **kwargs):  # noqa: ANN002, ANN003
        calls.append("run")
        return real(*args, **kwargs)

    monkeypatch.setattr("buried_pipeline.service.extract.extract_document", spy)
    client = client_for(sw)
    first = client.post("/v1/extract", json=extract_body(sw))
    second = client.post("/v1/extract", json=extract_body(sw))
    assert calls == ["run", "run"]  # two calls, two runs: nothing is remembered
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()  # the same inputs give the same proposals

    # A different region of the same plate is a different run, not a lookup.
    third = client.post("/v1/extract", json=extract_body(
        sw, region_px={"x": 0, "y": 0, "width": 320, "height": 520}))  # fmt: skip
    assert calls == ["run", "run", "run"] and third.json() != first.json()


def test_the_extract_route_never_reads_a_proposals_file(
    sw: ServiceWorld, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A stale proposals file on disk (as `buried extract` leaves in data/work/) is not an input."""
    use_synthetic_params(monkeypatch)
    stale = sw.world.paths.proposals_file("fip_v3_1911_229")
    original = stale.read_text(encoding="utf-8")
    stale.write_text('{"features": ["a stale result"]}', encoding="utf-8")
    try:
        r = client_for(sw).post("/v1/extract", json=extract_body(sw))
    finally:
        stale.write_text(original, encoding="utf-8")
    assert r.status_code == 200 and "a stale result" not in r.text
