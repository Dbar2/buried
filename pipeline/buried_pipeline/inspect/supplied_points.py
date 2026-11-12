"""U of T's own ground control points, shipped as a `.txt` in each plate zip.

One point per line: `source_x  source_y  map_easting  map_northing`, whitespace separated. These
are the points the supplied georeferencing was fitted to, so they are NOT independent check
points. They are recorded in the inspect report as provenance only; nothing reads them for
alignment (spec 02 requirement 14.6).
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any

COLUMNS = ("source_x", "source_y", "map_easting", "map_northing")
PROVENANCE_NOTE = (
    "The points U of T fitted the supplied georeferencing to. Provenance only: they are not "
    "independent check points and are never used to measure alignment. source_x and source_y "
    "are copied as written; their units are not stated in the file. map_easting and "
    "map_northing are in map_crs (the raster's CRS)."
)


def parse_supplied_points(text: str) -> list[dict[str, float]]:
    """Parse the file text. Raises ValueError naming the line when a line is not 4 numbers."""
    points: list[dict[str, float]] = []
    for number, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            continue
        parts = line.split()
        if len(parts) != len(COLUMNS):
            raise ValueError(f"line {number}: expected {len(COLUMNS)} numbers, found {len(parts)}")
        try:
            values = [float(p) for p in parts]
        except ValueError as exc:
            raise ValueError(f"line {number}: not a number ({exc})") from exc
        if not all(math.isfinite(v) for v in values):
            raise ValueError(f"line {number}: a value is not finite")
        points.append(dict(zip(COLUMNS, values, strict=True)))
    return points


def find_points_file(raster: Path) -> Path | None:
    """The `.txt` with the raster's own name (`v3-1911-229.txt` next to `v3-1911-229.tif`)."""
    for candidate in sorted(raster.parent.iterdir()):
        if candidate.is_file() and candidate.suffix.lower() == ".txt" and (
            candidate.stem.lower() == raster.stem.lower()
        ):
            return candidate
    return None


def supplied_points_block(
    raster: Path, map_crs: str, root: Path, notes: list[str]
) -> dict[str, Any] | None:
    """The report block, or None when the plate shipped no points file. A file that cannot be
    parsed adds a WARNING to `notes` and gives None."""
    path = find_points_file(raster)
    if path is None:
        return None
    try:
        rel = path.relative_to(root).as_posix()
    except ValueError:
        rel = path.as_posix()
    try:
        points = parse_supplied_points(path.read_text(encoding="utf-8", errors="replace"))
    except ValueError as exc:
        notes.append(f"WARNING: could not read the supplied control points in {rel}: {exc}")
        return None
    return {
        "file": rel,
        "count": len(points),
        "independent": False,
        "note": PROVENANCE_NOTE,
        "columns": list(COLUMNS),
        "map_crs": map_crs,
        "points": points,
    }
