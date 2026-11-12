"""The convex hull of a record's control points (spec 02 requirement 18, spec 01 requirement 30).

Pure. The hull is built from the control points' `reference` positions in EPSG:26917 metres. The
alignment error figure is measured inside it, so a feature outside it rests on an extrapolation.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from shapely.geometry import MultiPoint, Point, Polygon
from shapely.geometry.polygon import orient

from buried_pipeline.errors import PipelineError

HULL_DECIMALS = 3
HULL_MATCH_TOLERANCE_M = 0.01


def control_hull(references: Sequence[tuple[float, float]]) -> dict[str, Any]:
    """The hull as a GeoJSON Polygon, rounded to 3 decimals.

    The exterior ring runs counter-clockwise from its lowest-easting (then lowest-northing)
    vertex, so the same points always give the same bytes. Raises PipelineError when the points
    are collinear or fewer than three distinct positions, because then there is no area to
    measure inside.
    """
    hull = MultiPoint([(float(e), float(n)) for e, n in references]).convex_hull
    if not isinstance(hull, Polygon) or hull.is_empty or hull.area <= 0.0:
        raise PipelineError(
            "The control points do not enclose an area (they are collinear or too few), so "
            "there is no control hull"
        )
    ring = list(orient(hull, 1.0).exterior.coords)[:-1]
    start = min(range(len(ring)), key=lambda i: (ring[i][0], ring[i][1]))
    ring = ring[start:] + ring[:start]
    rounded = [[round(e, HULL_DECIMALS), round(n, HULL_DECIMALS)] for e, n in ring]
    rounded.append(list(rounded[0]))
    return {"type": "Polygon", "coordinates": [rounded]}


def hull_area_m2(hull: dict[str, Any]) -> float:
    """The area of a hull as stored (after rounding), rounded to 3 decimals."""
    return round(Polygon(hull["coordinates"][0]).area, HULL_DECIMALS)


def hull_share_of_ground(hull: dict[str, Any], ground: dict[str, Any]) -> float:
    """The share of `ground` (a Polygon, for example a map area through the chosen transform)
    that lies inside `hull`: area(hull ∩ ground) / area(ground), between 0 and 1. Pure."""
    h = Polygon(hull["coordinates"][0])
    g = Polygon(ground["coordinates"][0])
    if g.area <= 0.0:
        raise PipelineError("The map area has no ground area, so no share can be computed")
    return float(min(1.0, max(0.0, h.intersection(g).area / g.area)))


def hull_matches(
    stored: dict[str, Any],
    references: Sequence[tuple[float, float]],
    tolerance_m: float = HULL_MATCH_TOLERANCE_M,
) -> bool:
    """Whether `stored` is the convex hull of `references` within `tolerance_m` metres.

    Compared as shapes, not as rings, so vertex order and starting vertex do not matter. Every
    true hull vertex must lie within the tolerance of the stored polygon's boundary and the other
    way round, which also catches an extra or a missing corner.
    """
    try:
        expected = control_hull(references)
    except PipelineError:
        return False
    try:
        a = Polygon(stored["coordinates"][0])
        b = Polygon(expected["coordinates"][0])
    except (ValueError, TypeError, IndexError, KeyError):
        return False
    if not a.is_valid or not b.is_valid:
        return False
    a_vertices = [tuple(c) for c in a.exterior.coords]
    b_vertices = [tuple(c) for c in b.exterior.coords]
    close_a = all(b.exterior.distance(Point(v[0], v[1])) <= tolerance_m for v in a_vertices)
    close_b = all(a.exterior.distance(Point(v[0], v[1])) <= tolerance_m for v in b_vertices)
    return close_a and close_b
