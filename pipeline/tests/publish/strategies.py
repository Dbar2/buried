"""A synthetic plate that has been through `extract`, and the decisions files built on it
(spec 02 task 8). Three buildings; nothing here describes a real one.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from hypothesis import strategies as st

from buried_pipeline.paths import Paths
from buried_pipeline.publish.build import BuildInputs
from buried_pipeline.publish.decisions import parse_decisions
from tests.extract.test_run import HEIGHT, MAP_AREA, WIDTH, build, extract, read
from tests.tile.test_run import SOURCE, TRANSFORM
from tests.validate.builders import NOW  # noqa: F401  (re-exported for the tests)
from tests.validate.builders import project as base_project

CONFIRMED_AT = "2026-11-12T10:00:00Z"
REVIEWER = "Test Reviewer"
# A reviewed area in the margin of the plate, where no building is drawn.
EMPTY_CORNER = [[11, 11], [20, 11], [20, 20], [11, 20]]


@dataclass(frozen=True)
class World:
    paths: Paths
    proposals: dict[str, Any]

    @property
    def ids(self) -> list[str]:
        return [f["id"] for f in self.proposals["features"]]


def make_world(tmp_path: Path) -> World:
    paths = build(tmp_path)
    project = base_project()
    project["origin"] = {"easting": 632000.0, "northing": 4835000.0}
    project["bounds"] = {"min_e": 631000.0, "min_n": 4834000.0, "max_e": 633000.0,
                         "max_n": 4836000.0}  # fmt: skip
    (paths.data / "project.json").write_text(json.dumps(project), encoding="utf-8")
    extract(paths)
    world = World(paths, read(paths))
    assert len(world.ids) == 3
    return world


def mapping(x: float, y: float) -> tuple[float, float]:
    a, b, c, d, e, f = TRANSFORM
    return (a * x + b * y + c, d * x + e * y + f)


def area(polygon: list[list[int]] | None = None, **extra: Any) -> dict[str, Any]:
    return {
        "pixel_polygon": polygon or MAP_AREA,
        "confirmed_by": REVIEWER,
        "confirmed_at": CONFIRMED_AT,
        **extra,
    }


def accept(pid: str, **extra: Any) -> dict[str, Any]:
    return {"proposal_id": pid, "decision": "accept", "confirmed_by": REVIEWER,
            "confirmed_at": CONFIRMED_AT, **extra}  # fmt: skip


def reject(pid: str) -> dict[str, Any]:
    return {"proposal_id": pid, "decision": "reject", "confirmed_by": REVIEWER,
            "confirmed_at": CONFIRMED_AT}  # fmt: skip


def decisions_doc(
    decisions: list[dict[str, Any]], areas: list[dict[str, Any]] | None = None
) -> dict[str, Any]:
    return {"source": SOURCE, "decisions": decisions,
            "reviewed_areas": [area()] if areas is None else areas}  # fmt: skip


def inputs(
    world: World,
    doc: dict[str, Any],
    existing: dict[str, Any] | None = None,
    alignment_error_m: float = 4.3,
    pixel_size_m: float = 0.06,
) -> BuildInputs:
    return BuildInputs(
        source_id=SOURCE,
        proposals=world.proposals,
        decisions=parse_decisions(doc, SOURCE),
        existing=existing,
        alignment_error_m=alignment_error_m,
        source_pixel_size_m=pixel_size_m,
        alignment_record_sha256=world.proposals["alignment_record_sha256"],
        mapping=mapping,
        raster_size=(WIDTH, HEIGHT),
    )


# --- Hypothesis strategies ------------------------------------------------------------------------

positive_m = st.floats(min_value=0.1, max_value=60.0, allow_nan=False, allow_infinity=False)
pixel_sizes = st.floats(min_value=0.01, max_value=2.0, allow_nan=False, allow_infinity=False)


@st.composite
def reviews(draw: st.DrawFn, ids: list[str], allow_unconfirmed: bool = False) -> list[dict[str, Any]]:
    """For each proposal id: leave it out, accept it, or reject it. Accepts may raise the position
    error; with `allow_unconfirmed`, some accepts name no reviewer."""
    out: list[dict[str, Any]] = []
    for pid in ids:
        choice = draw(st.sampled_from(["none", "accept", "reject"]))
        if choice == "reject":
            out.append(reject(pid))
        elif choice == "accept":
            extra: dict[str, Any] = {}
            if draw(st.booleans()):
                extra["position_error_m"] = draw(positive_m)
            d = accept(pid, **extra)
            if allow_unconfirmed and draw(st.booleans()):
                d.pop("confirmed_by")
            out.append(d)
    return out
