"""Hypothesis strategies for the match properties: two plates with boxes that are often twins of
each other, random coverage areas, optional person work, an aerial and a decisions file."""

from __future__ import annotations

from hypothesis import strategies as st
from shapely.geometry import box

from buried_pipeline.match.apply import Decisions, ObservationDecision
from buried_pipeline.match.compute import AerialInfo, MatchInputs
from tests.helpers.synthetic_evidence import (
    EAST0,
    NORTH0,
    P1911,
    P1911B,
    P1935,
    building,
    evidence_doc,
    feature_error,
    link,
    person_observation,
)

AERIAL = "aerial_1947_s0012_fl1947_it0018h"
YEAR_TO = {P1911: 1914, P1935: 1935, AERIAL: 1947}
MIN_ERROR = {
    P1911: feature_error(P1911),
    P1911B: feature_error(P1911B),
    P1935: feature_error(P1935),
}
BY = {"confirmed_by": "A. Person", "confirmed_at": "2026-11-19T10:00:00-05:00"}

half_metres = st.integers(0, 200).map(lambda v: v / 2)  # 0 to 100 m in 0.5 m steps
Rect = tuple[float, float, float, float]


@st.composite
def rects(draw: st.DrawFn) -> Rect:
    x0, y0 = draw(half_metres), draw(half_metres)
    w, h = draw(st.integers(8, 90)) / 2, draw(st.integers(8, 90)) / 2
    return (x0, y0, x0 + w, y0 + h)


@st.composite
def jittered(draw: st.DrawFn, r: Rect) -> Rect:
    dx0, dy0, dx1, dy1 = (draw(st.integers(-12, 12)) / 2 for _ in range(4))
    x0, y0 = r[0] + dx0, r[1] + dy0
    return (x0, y0, max(x0 + 4, r[2] + dx1), max(y0 + 4, r[3] + dy1))


@st.composite
def areas(draw: st.DrawFn) -> Rect | None:
    kind = draw(st.sampled_from(["none", "full", "full", "partial"]))
    if kind == "none":
        return None
    if kind == "full":
        return (-60.0, -60.0, 200.0, 200.0)
    x0, y0 = draw(st.integers(-40, 60)), draw(st.integers(-40, 60))
    return (float(x0), float(y0), float(x0 + draw(st.integers(30, 160))),
            float(y0 + draw(st.integers(30, 160))))  # fmt: skip


@st.composite
def reviewed_areas(draw: st.DrawFn) -> list[Rect] | None:
    if draw(st.booleans()):
        return None
    out = []
    for _ in range(draw(st.integers(1, 2))):
        x0, y0 = draw(st.integers(-50, 60)), draw(st.integers(-50, 60))
        out.append((float(x0), float(y0), float(x0 + draw(st.integers(30, 200))),
                    float(y0 + draw(st.integers(30, 200)))))  # fmt: skip
    return out


def extra_error(draw: st.DrawFn, origin: str) -> float:
    return round(MIN_ERROR[origin] + draw(st.integers(0, 20)) / 10, 1)


@st.composite
def worlds(
    draw: st.DrawFn, *, person: bool = False, decisions: bool = False, clashes: bool = False
) -> MatchInputs:
    first = draw(st.lists(rects(), min_size=0, max_size=4))
    second: list[Rect] = []
    for r in first:
        if draw(st.integers(0, 9)) < 7:
            second.append(draw(jittered(r)))
    second.extend(draw(st.lists(rects(), min_size=0, max_size=2)))
    if clashes and first:
        # A second 1911 box on top of an existing one: two candidates for one 1935 box.
        first.append(draw(jittered(first[0])))

    f1 = [
        building(P1911, i + 1, *r, error_m=extra_error(draw, P1911)) for i, r in enumerate(first)
    ]
    f2 = [
        building(P1935, i + 1, *r, error_m=extra_error(draw, P1935))
        for i, r in enumerate(second)
    ]

    if person:
        # Person work, consistent with itself: a few links (with both presences, each feature in
        # at most one link) and a few standalone observations.
        used: set[str] = set()
        for a in f1:
            for b in f2:
                if a["id"] in used or b["id"] in used:
                    continue
                if draw(st.integers(0, 11)) == 0:
                    used.update((a["id"], b["id"]))
                    a["properties"]["same_as"] = [link(b["id"], "person")]
                    b["properties"]["same_as"] = [link(a["id"], "person")]
                    a["properties"]["observations"].append(
                        person_observation(P1935, True, "clear"))
                    b["properties"]["observations"].append(
                        person_observation(P1911, True, "clear"))
        for feats, other in ((f1, P1935), (f2, P1911)):
            for f in feats:
                if "same_as" not in f["properties"] and draw(st.integers(0, 5)) == 0:
                    f["properties"]["observations"].append(
                        person_observation(
                            other, draw(st.booleans()), draw(st.sampled_from(["clear", "obscured"]))
                        )
                    )

    docs = {
        P1911: evidence_doc(P1911, f1, mapped=draw(areas()), reviewed=draw(reviewed_areas())),
        P1935: evidence_doc(P1935, f2, mapped=draw(areas()), reviewed=draw(reviewed_areas())),
    }
    ax0, ay0 = draw(st.integers(-30, 60)), draw(st.integers(-30, 60))
    footprint = box(
        EAST0 + ax0, NORTH0 + ay0, EAST0 + ax0 + draw(st.integers(20, 120)),
        NORTH0 + ay0 + draw(st.integers(20, 120)),
    )  # fmt: skip
    decided: Decisions = Decisions()
    if decisions:
        picks = [f["id"] for f in f1 + f2 if draw(st.booleans())]
        decided = Decisions(
            observations=tuple(
                ObservationDecision(
                    fid, AERIAL, draw(st.booleans()), draw(st.sampled_from(["clear", "obscured"])),
                    None, BY["confirmed_by"], BY["confirmed_at"],
                )  # fmt: skip
                for fid in picks
            )
        )
    return MatchInputs(
        docs=docs,
        plate_sources=frozenset({P1911, P1935}),
        min_error_m=dict(MIN_ERROR),
        aerials={AERIAL: AerialInfo(AERIAL, footprint, f"{AERIAL}.jpg")},
        year_to=dict(YEAR_TO),
        decisions=decided,
    )




@st.composite
def chains(draw: st.DrawFn) -> MatchInputs:
    """Four wide boxes in a row, shifted by about half their width, on three plates:
    F1 (1911/229) ~ G (1935/229) ~ H (1911/232) ~ F2 (1911/229). Each neighbouring pair matches
    and the ends are too far apart to compete, so the set would hold two 1911/229 features."""
    shift = draw(st.integers(44, 48))
    dy = [draw(st.integers(-3, 3)) for _ in range(4)]

    def at(i: int) -> Rect:
        return (float(i * shift), float(dy[i]), float(i * shift + 100), float(dy[i] + 100))

    f1 = [
        building(P1911, 1, *at(0), error_m=MIN_ERROR[P1911]),
        building(P1911, 2, *at(3), error_m=MIN_ERROR[P1911]),
    ]
    g = [building(P1935, 1, *at(1), error_m=MIN_ERROR[P1935])]
    h = [building(P1911B, 1, *at(2), error_m=MIN_ERROR[P1911B])]
    wide = (-100.0, -100.0, 500.0, 300.0)
    return MatchInputs(
        docs={
            P1911: evidence_doc(P1911, f1, mapped=wide, reviewed=[wide]),
            P1935: evidence_doc(P1935, g, mapped=wide, reviewed=[wide]),
            P1911B: evidence_doc(P1911B, h, mapped=wide, reviewed=[wide]),
        },
        plate_sources=frozenset({P1911, P1935, P1911B}),
        min_error_m=dict(MIN_ERROR),
        aerials={},
        year_to={**YEAR_TO, P1911B: 1914},
    )
