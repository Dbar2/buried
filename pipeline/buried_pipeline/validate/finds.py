"""Checks for `data/finds.json` (spec 06 requirement 8.2), after the Schema has passed it.

Pure: the finds file, the evidence files and the map area files are already read.

- `id`, `slug` and `order` are unique across the finds.
- Each reading's `source` is in the registry, and `feature_id` is a published feature of that
  source's evidence file, of the kind the find allows (`bld` for a building; `use` or `bld` for
  an area).
- Each reading's crop lies wholly inside the source's map area
  (data/control/map_area/<source>.json).
- Each find has at least one reading with a crop (the Schema also requires it).
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from shapely.geometry import Polygon
from shapely.geometry import box as shapely_box

from buried_pipeline.validate.context import Context, Doc
from buried_pipeline.validate.errors import ValidationError, err

ALLOWED_PREFIXES = {"building": ("bld",), "area": ("use", "bld")}


def _duplicates(path: str, finds: Sequence[dict[str, Any]], key: str) -> list[ValidationError]:
    seen: dict[Any, int] = {}
    out: list[ValidationError] = []
    for i, find in enumerate(finds):
        value = find[key]
        if value in seen:
            out.append(err(path, f"/finds/{i}/{key}",
                           f"{key} {value!r} repeats (also at /finds/{seen[value]}/{key})"))
        else:
            seen[value] = i
    return out


def _published_features(evidence: Sequence[Doc]) -> dict[str, dict[str, set[str]]]:
    """Per source: the ids of its published features, under key "published", and all ids, under
    key "all"."""
    out: dict[str, dict[str, set[str]]] = {}
    for d in evidence:
        features = d.doc["features"]
        out[d.doc["origin_source"]] = {
            "published": {f["id"] for f in features if f["properties"]["status"] == "published"},
            "all": {f["id"] for f in features},
        }
    return out


def check_finds(
    doc: dict[str, Any], path: str, evidence: Sequence[Doc], ctx: Context
) -> list[ValidationError]:
    finds: list[dict[str, Any]] = doc["finds"]
    out: list[ValidationError] = []
    for key in ("id", "slug", "order"):
        out.extend(_duplicates(path, finds, key))
    by_source = _published_features(evidence)

    for i, find in enumerate(finds):
        crops = 0
        for j, reading in enumerate(find["readings"]):
            here = f"/finds/{i}/readings/{j}"
            source, fid = reading["source"], reading["feature_id"]
            registered = source in ctx.sources
            if not registered:
                out.append(err(path, f"{here}/source", f"source {source} is not in "
                               "data/sources.json"))
            features = by_source.get(source)
            if registered and features is None:
                out.append(err(path, f"{here}/feature_id", f"{source} has no evidence file, so "
                               f"{fid} is not a published feature of it"))
            elif features is not None:
                if fid not in features["all"]:
                    out.append(err(path, f"{here}/feature_id", f"{fid} is not a feature of "
                                   f"{source}"))
                elif fid not in features["published"]:
                    out.append(err(path, f"{here}/feature_id", f"{fid} is not published (its "
                                   f"status is not 'published') in {source}"))
            prefix = fid.split("_", 1)[0]
            if prefix not in ALLOWED_PREFIXES[find["kind"]]:
                allowed = " or ".join(ALLOWED_PREFIXES[find["kind"]])
                out.append(err(path, f"{here}/feature_id", f"a find of kind {find['kind']} is "
                               f"read from a {allowed} feature, not {prefix}"))
            if not fid.startswith(f"{prefix}_{source}_"):
                out.append(err(path, f"{here}/feature_id", f"{fid} does not belong to {source}"))

            crop = reading["crop_px"]
            area = ctx.map_areas.get(source)
            if area is None:
                if registered:
                    out.append(err(path, f"{here}/crop_px", f"{source} has no map area file, so "
                                   "the crop cannot be placed inside it"))
            else:
                rect = shapely_box(crop["x"], crop["y"], crop["x"] + crop["width"],
                                   crop["y"] + crop["height"])
                if not Polygon(area["pixel_polygon"]).covers(rect):
                    out.append(err(path, f"{here}/crop_px", "the crop is not wholly inside the "
                                   f"map area of {source}"))
            crops += 1
        if crops == 0:
            out.append(err(path, f"/finds/{i}/readings", "a find needs at least one reading with "
                           "a crop"))
    return out
