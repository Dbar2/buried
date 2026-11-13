"""Quality score and weakness flags (design.md "Steps" 8, requirement 17.4 and 17.5).

Pure and small, so the properties (bounded, `score` = the minimum component) can be tested on their
own. Every component is in [0, 1]; the score is the minimum so one weak component cannot be hidden
by strong ones.
"""

from __future__ import annotations

from dataclasses import dataclass

# The cut below which a component is called out as a weakness. A design value for display, not
# tuned (design.md "Steps" 8).
WEAKNESS_CUT = 0.9

COMPONENT_NAMES = (
    "outline_closure",
    "fill_uniformity",
    "text_clear",
    "edge_clear",
    "shape_fidelity",
)


@dataclass(frozen=True)
class Quality:
    outline_closure: float
    fill_uniformity: float
    text_clear: float
    edge_clear: float
    shape_fidelity: float

    @property
    def score(self) -> float:
        return min(
            self.outline_closure,
            self.fill_uniformity,
            self.text_clear,
            self.edge_clear,
            self.shape_fidelity,
        )


def clamp01(value: float) -> float:
    return float(min(1.0, max(0.0, value)))


def make_quality(
    outline_closure: float,
    fill_uniformity: float,
    text_clear: float,
    edge_clear: float,
    shape_fidelity: float,
) -> Quality:
    return Quality(
        outline_closure=clamp01(outline_closure),
        fill_uniformity=clamp01(fill_uniformity),
        text_clear=clamp01(text_clear),
        edge_clear=clamp01(edge_clear),
        shape_fidelity=clamp01(shape_fidelity),
    )


def iou(inter: float, union: float) -> float:
    return 1.0 if union <= 0 else inter / union


def weaknesses(
    quality: Quality, tone_class: str, touches_edge: bool, touches_fold: bool
) -> tuple[str, ...]:
    """The flags that pulled the score down, in a fixed order."""
    flags: list[str] = []
    if quality.outline_closure < WEAKNESS_CUT:
        flags.append("open_outline")
    if tone_class == "hatched":
        flags.append("hatched_fill")
    if quality.text_clear < WEAKNESS_CUT:
        flags.append("text_overlap")
    if touches_edge:
        flags.append("touches_edge")
    if touches_fold:
        flags.append("touches_fold")
    return tuple(flags)
