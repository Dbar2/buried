"""Hypothesis strategies for the schema 1.1.0 properties (P22, P23, and P19 with the aerial origin).

As in `strategies.py`, every strategy builds data the Validator accepts, so a property breaks
exactly one thing and expects an error.
"""

from __future__ import annotations

import math
from typing import Any

from hypothesis import assume
from hypothesis import strategies as st
from shapely.geometry import MultiPoint, Point, Polygon

from buried_pipeline.align.hull import control_hull, hull_area_m2
from tests.validate.builders import (
    E0,
    INTERSECTIONS,
    LONG_AGO,
    N0,
    P1911,
    alignment_with_hull,
    minimal_dataset,
    present_feature,
    present_layer,
)
from tests.validate.strategies import building_features

# --- years labels (P22) -------------------------------------------------------------------------


def four_digit_numbers_by_scan(text: str) -> set[str]:
    """Every maximal run of exactly four digits, found by walking the string (an oracle that
    shares no code with the Validator's regular expression)."""
    found: set[str] = set()
    run = ""
    for ch in [*text, " "]:
        if ch in "0123456789":
            run += ch
        else:
            if len(run) == 4:
                found.add(run)
            run = ""
    return found


@st.composite
def year_label_cases(draw: st.DrawFn) -> dict[str, Any]:
    a = draw(st.integers(1800, 2030))
    b = draw(st.one_of(st.just(a), st.integers(a, min(a + 40, 2030))))
    stray = draw(st.sampled_from(["12", "123", "12345", "plate 2"]))  # never a 4-digit number
    templates = [
        "{a}", "{a}, revised to {b}", "{a} to {b}", "{a}-{b}", "{b}, from {a}",
        "{a} ({b})", "plate " + stray + ": {a} to {b}",
    ]  # fmt: skip
    label = draw(st.sampled_from(templates)).format(a=a, b=b)
    damage = draw(st.sampled_from(["none", "none", "extra", "drop_a", "drop_b", "swap_a"]))
    other = draw(st.integers(1800, 2030).filter(lambda y: y not in (a, b)))
    if damage == "extra":
        label += f", reprinted {other}"
    elif damage == "drop_a":
        label = label.replace(str(a), "")
    elif damage == "drop_b":
        label = label.replace(str(b), "") if b != a else label.replace(str(a), "")
    elif damage == "swap_a":
        label = label.replace(str(a), str(other))
    return {"year_from": a, "year_to": b, "label": label}


def label_is_honest(case: dict[str, Any]) -> bool:
    return four_digit_numbers_by_scan(case["label"]) == {
        str(case["year_from"]), str(case["year_to"])
    }


# --- attributes and their reads (P22) -----------------------------------------------------------

ATTRIBUTE_VALUES: dict[str, Any] = {
    "use": "synthetic use",
    "material": "synthetic material as lettered",
    "storeys": 2,
    "street_number": "12",
}


def attribute_read(attribute: str) -> dict[str, Any]:
    return {
        "attribute": attribute,
        "crop_px": {"x": 5, "y": 5, "width": 30, "height": 12},
        "read_by": "person",
        "confirmed_by": "synthetic reviewer",
        "confirmed_at": LONG_AGO,
    }


@st.composite
def feature_datasets_with_reads(draw: st.DrawFn) -> tuple[dict[str, Any], str, list[str]]:
    """A valid one-file dataset whose first feature has 1 to 4 attributes, each with a read.
    Returns (dataset, feature id, attribute names)."""
    names = draw(st.lists(st.sampled_from(sorted(ATTRIBUTE_VALUES)), min_size=1, max_size=4,
                          unique=True))
    f = draw(building_features(P1911, 1))
    f["properties"]["attributes"] = {n: ATTRIBUTE_VALUES[n] for n in names}
    f["properties"]["provenance"]["attribute_reads"] = [attribute_read(n) for n in names]
    # A building that is "documented" must have storeys; estimated has no such rule.
    f["properties"]["confidence"] = "estimated"
    ds = minimal_dataset([f])
    return ds, f["id"], names


# --- control hulls (P23) ------------------------------------------------------------------------


def _min_interior_angle_deg(ring: list[tuple[float, float]]) -> float:
    n = len(ring)
    worst = 180.0
    for i in range(n):
        p, q, r = ring[i - 1], ring[i], ring[(i + 1) % n]
        v1 = (p[0] - q[0], p[1] - q[1])
        v2 = (r[0] - q[0], r[1] - q[1])
        cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (math.hypot(*v1) * math.hypot(*v2))
        worst = min(worst, math.degrees(math.acos(max(-1.0, min(1.0, cos)))))
    return worst


@st.composite
def reference_sets(draw: st.DrawFn) -> list[tuple[float, float]]:
    """3 to 8 distinct reference positions (millimetre precision) in the fake project, whose
    convex hull has a well-conditioned shape: area of at least 2000 m2, every corner at least
    20 degrees, so that a few-metre error at one corner cannot hide near an edge."""
    n = draw(st.integers(3, 8))
    pts = draw(st.lists(
        st.tuples(st.integers(-800_000, 800_000), st.integers(-800_000, 800_000)),
        min_size=n, max_size=n, unique=True,
    ))
    refs = [(E0 + e / 1000.0, N0 + m / 1000.0) for e, m in pts]
    hull = MultiPoint(refs).convex_hull
    assume(isinstance(hull, Polygon) and hull.area >= 2000.0)
    ring = [(c[0], c[1]) for c in hull.exterior.coords][:-1]
    assume(_min_interior_angle_deg(ring) >= 20.0)
    return refs


def dataset_with_references(refs: list[tuple[float, float]]) -> dict[str, Any]:
    """A valid tree whose control file for plate 1911 has exactly these reference positions
    (one intersection feature each), with a 1.1.0 alignment record stating their hull."""
    layer = present_layer(
        INTERSECTIONS,
        [present_feature(f"i{k}", {"type": "Point", "coordinates": [e, n]})
         for k, (e, n) in enumerate(refs)],
    )
    control = {
        "schema_version": "1.1.0", "source": P1911, "pixel_convention": "gdal_corner",
        "points": [{
            "id": f"cp_{k}", "description": "Synthetic.", "pixel": [100 * (k + 1), 50 * (k + 2)],
            "reference": [e, n], "reference_source": INTERSECTIONS,
            "reference_kind": "intersection", "reference_feature_id": f"i{k}",
        } for k, (e, n) in enumerate(refs)],
    }
    ds = minimal_dataset()
    ds[f"data/present/{INTERSECTIONS}.geojson"] = layer
    ds[f"data/control/{P1911}.json"] = control
    ds[f"data/alignment/{P1911}.json"] = alignment_with_hull(P1911, control)
    return ds


@st.composite
def hull_mutations(draw: st.DrawFn, refs: list[tuple[float, float]]) -> dict[str, Any]:
    """How the stored hull is changed, and whether it is still the hull within 0.01 m.

    Accepted changes move every vertex by at most 0.004 m in each coordinate (under 0.0057 m).
    Rejected changes move one vertex by 2 m or more, drop a vertex that matters, add a vertex
    that sticks out, or replace the ring with a different shape. `ok` is set by construction,
    not by calling the Validator or the hull code.
    """
    true = control_hull(refs)
    ring = [list(p) for p in true["coordinates"][0][:-1]]
    kind = draw(st.sampled_from(
        ["exact", "jitter", "far_vertex", "drop_vertex", "extra_vertex", "other_shape"]
    ))
    ok = kind in ("exact", "jitter")
    if kind == "jitter":
        ring = [
            [round(e + draw(st.integers(-4, 4)) / 1000.0, 3),
             round(n + draw(st.integers(-4, 4)) / 1000.0, 3)] for e, n in ring
        ]
    elif kind == "far_vertex":
        i = draw(st.integers(0, len(ring) - 1))
        cx = sum(p[0] for p in ring) / len(ring)
        cy = sum(p[1] for p in ring) / len(ring)
        d = math.hypot(ring[i][0] - cx, ring[i][1] - cy)
        push = draw(st.floats(2.0, 30.0))
        ring[i] = [round(ring[i][0] + (ring[i][0] - cx) / d * push, 3),
                   round(ring[i][1] + (ring[i][1] - cy) / d * push, 3)]
        # By construction the pushed vertex sits well clear of the true boundary.
        assume(Point(*ring[i]).distance(Polygon(true["coordinates"][0]).exterior) > 0.05)
    elif kind == "drop_vertex":
        assume(len(ring) >= 4)
        i = draw(st.integers(0, len(ring) - 1))
        rest = ring[:i] + ring[i + 1:]
        assume(Point(*ring[i]).distance(Polygon(rest).exterior) > 0.05)
        ring = rest
    elif kind == "extra_vertex":
        i = draw(st.integers(0, len(ring) - 1))
        a, b = ring[i], ring[(i + 1) % len(ring)]
        mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
        cx = sum(p[0] for p in ring) / len(ring)
        cy = sum(p[1] for p in ring) / len(ring)
        d = math.hypot(mid[0] - cx, mid[1] - cy)
        assume(d > 1.0)
        out = [round(mid[0] + (mid[0] - cx) / d * 3.0, 3), round(mid[1] + (mid[1] - cy) / d * 3.0, 3)]
        assume(Point(*out).distance(Polygon(true["coordinates"][0]).exterior) > 0.05)
        ring = ring[: i + 1] + [out] + ring[i + 1:]
    elif kind == "other_shape":
        ring = [[E0 - 5.0, N0 - 5.0], [E0 + 5.0, N0 - 5.0], [E0 + 5.0, N0 + 5.0],
                [E0 - 5.0, N0 + 5.0]]
    stored = {"type": "Polygon", "coordinates": [[*ring, ring[0]]]}
    assume(Polygon(stored["coordinates"][0]).is_valid)
    return {"kind": kind, "ok": ok, "hull": stored, "area": hull_area_m2(stored)}
