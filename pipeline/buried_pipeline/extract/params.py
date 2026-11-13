"""The extraction parameter set (spec 02 requirements 8.4 and 9.1, design.md "Parameter set").

Every threshold of `buried extract` is read from one versioned file, `params/<id>.json`. Sizes
are in metres so the same set applies to any plate whatever its pixel size; grey thresholds are
on the normalised 0 to 1 scale after local-contrast normalisation. There are no plate-specific
values.

`TUNING_SOURCES` is defined here and nowhere else. A parameter set may only claim to have been
tuned on those plates (`tuned_on` is checked on load, and again by the held-out guard test).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from buried_pipeline.errors import PipelineError

TUNING_SOURCES = ("fip_v3_1911_229", "fip_v3_1935_229")
PARAMS_DIR = Path(__file__).parent / "params"
DEFAULT_PARAMS_ID = "v1"


@dataclass(frozen=True)
class NormaliseParams:
    window_m: float
    clip_limit: float


@dataclass(frozen=True)
class OutlineParams:
    max_grey: float
    closing_kernel_m: float


@dataclass(frozen=True)
class ToneParams:
    light_min: float
    dark_max: float
    hatch_min: float
    hatch_min_density: float
    mixed_spread: float


@dataclass(frozen=True)
class TextParams:
    max_mark_area_m2: float


@dataclass(frozen=True)
class RegionParams:
    min_area_m2: float
    max_area_m2: float
    hole_fill_m2: float
    min_outline_closure: float


@dataclass(frozen=True)
class ExtractParams:
    id: str
    tuned_on: tuple[str, ...]
    working_pixel_size_m: float
    normalise: NormaliseParams
    outline: OutlineParams
    tone: ToneParams
    text: TextParams
    regions: RegionParams
    simplify_tolerance_m: float
    fixture_baseline: dict[str, dict[str, float]] = field(default_factory=dict)
    sha256: str = ""


def check_tuned_on(tuned_on: Any, where: str) -> tuple[str, ...]:
    """`tuned_on` must be a list of tuning plates (requirement 9.1)."""
    if not isinstance(tuned_on, list) or not all(isinstance(s, str) for s in tuned_on):
        raise PipelineError(f"{where}: tuned_on must be a list of source ids")
    outside = sorted(set(tuned_on) - set(TUNING_SOURCES))
    if outside:
        raise PipelineError(
            f"{where}: tuned_on names {', '.join(outside)}, which is not a tuning plate "
            f"({', '.join(TUNING_SOURCES)})"
        )
    return tuple(tuned_on)


def _section(doc: dict[str, Any], key: str, where: str) -> dict[str, Any]:
    value = doc.get(key)
    if not isinstance(value, dict):
        raise PipelineError(f"{where}: missing section {key!r}")
    return value


def _number(section: dict[str, Any], key: str, where: str, *, positive: bool = True) -> float:
    value = section.get(key)
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise PipelineError(f"{where}: {key!r} must be a number")
    if positive and value <= 0:
        raise PipelineError(
            f"{where}: {key!r} is {value}; a value of 0 is a placeholder. Set it during tuning."
        )
    return float(value)


def parse_params(doc: Any, sha256: str, where: str = "parameter set") -> ExtractParams:
    if not isinstance(doc, dict):
        raise PipelineError(f"{where}: not a JSON object")
    pid = doc.get("id")
    if not isinstance(pid, str) or not pid:
        raise PipelineError(f"{where}: missing id")
    tuned_on = check_tuned_on(doc.get("tuned_on"), where)

    norm = _section(doc, "normalise", where)
    outline = _section(doc, "outline", where)
    tone = _section(doc, "tone", where)
    text = _section(doc, "text", where)
    regions = _section(doc, "regions", where)

    baseline_raw = doc.get("fixture_baseline", {})
    if not isinstance(baseline_raw, dict):
        raise PipelineError(f"{where}: fixture_baseline must be an object")
    baseline: dict[str, dict[str, float]] = {}
    for fixture_id, entry in baseline_raw.items():
        baseline[str(fixture_id)] = {
            "mean_iou": _number(entry, "mean_iou", where, positive=False),
            "matched_fraction": _number(entry, "matched_fraction", where, positive=False),
        }

    params = ExtractParams(
        id=pid,
        tuned_on=tuned_on,
        working_pixel_size_m=_number(doc, "working_pixel_size_m", where),
        normalise=NormaliseParams(
            window_m=_number(norm, "window_m", where),
            clip_limit=_number(norm, "clip_limit", where),
        ),
        outline=OutlineParams(
            max_grey=_number(outline, "max_grey", where),
            closing_kernel_m=_number(outline, "closing_kernel_m", where),
        ),
        tone=ToneParams(
            light_min=_number(tone, "light_min", where),
            dark_max=_number(tone, "dark_max", where),
            hatch_min=_number(tone, "hatch_min", where),
            hatch_min_density=_number(tone, "hatch_min_density", where),
            mixed_spread=_number(tone, "mixed_spread", where),
        ),
        text=TextParams(max_mark_area_m2=_number(text, "max_mark_area_m2", where)),
        regions=RegionParams(
            min_area_m2=_number(regions, "min_area_m2", where),
            max_area_m2=_number(regions, "max_area_m2", where),
            hole_fill_m2=_number(regions, "hole_fill_m2", where),
            min_outline_closure=_number(regions, "min_outline_closure", where),
        ),
        simplify_tolerance_m=_number(doc, "simplify_tolerance_m", where),
        fixture_baseline=baseline,
        sha256=sha256,
    )
    if params.tone.dark_max >= params.tone.light_min:
        raise PipelineError(f"{where}: tone.dark_max must be below tone.light_min")
    if params.regions.min_area_m2 >= params.regions.max_area_m2:
        raise PipelineError(f"{where}: regions.min_area_m2 must be below regions.max_area_m2")
    return params


def load_params(params_id: str = DEFAULT_PARAMS_ID, directory: Path | None = None) -> ExtractParams:
    """Read `params/<id>.json`. Refuses a set that claims a plate outside the tuning plates, and a
    set that still holds placeholder zeros."""
    path = (directory or PARAMS_DIR) / f"{params_id}.json"
    if not path.is_file():
        raise PipelineError(f"No parameter set {params_id!r} ({path.name} not found)")
    raw = path.read_bytes()
    try:
        doc = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise PipelineError(f"{path.name} is not valid JSON: {exc}") from exc
    params = parse_params(doc, hashlib.sha256(raw).hexdigest(), path.name)
    if params.id != params_id:
        raise PipelineError(f"{path.name} has id {params.id!r}, expected {params_id!r}")
    return params
