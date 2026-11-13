"""Reading and applying the match decisions file, and editing observations and links on parsed
evidence documents (pure: no file access, the clock never read). Spec 02 requirements 13.8 to
13.11, design.md "Match decisions file".

`match` touches nothing but `properties.observations` and `properties.same_as` (spec 01
requirement 17.4). Every function here edits only those two keys.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from buried_pipeline.errors import PipelineError
from buried_pipeline.match.links import Edge, edge

AUTO = "match_auto"
PERSON = "person"
ORIGIN = "origin"
VISIBILITIES = ("clear", "obscured", "not_covered")


@dataclass(frozen=True)
class LinkDecision:
    features: Edge
    confirmed_by: str
    confirmed_at: str


@dataclass(frozen=True)
class NoLinkDecision:
    features: Edge
    confirmed_by: str
    confirmed_at: str


@dataclass(frozen=True)
class ObservationDecision:
    feature: str
    source: str
    present: bool
    visibility: str
    note: str | None
    confirmed_by: str
    confirmed_at: str


@dataclass(frozen=True)
class Decisions:
    links: tuple[LinkDecision, ...] = ()
    no_links: tuple[NoLinkDecision, ...] = ()
    observations: tuple[ObservationDecision, ...] = ()

    @property
    def no_link_edges(self) -> frozenset[Edge]:
        return frozenset(d.features for d in self.no_links)


def _text(raw: Mapping[str, Any], key: str, where: str) -> str:
    value = raw.get(key)
    if not isinstance(value, str) or not value.strip():
        raise PipelineError(f"{where}: {key} is required (every decision names who made it)")
    return value


def _pair(raw: Mapping[str, Any], where: str) -> Edge:
    features = raw.get("features")
    if (
        not isinstance(features, list)
        or len(features) != 2
        or not all(isinstance(f, str) and f for f in features)
        or features[0] == features[1]
    ):
        raise PipelineError(f"{where}: features must be two different feature ids")
    return edge(features[0], features[1])


def parse_decisions(doc: Any) -> Decisions:
    """The decisions file as data, or a PipelineError that names the decision. A decision without
    `confirmed_by` and `confirmed_at` is refused (requirement 13.9)."""
    if doc is None:
        return Decisions()
    if not isinstance(doc, dict) or set(doc) != {"decisions"} or not isinstance(
        doc["decisions"], list
    ):
        raise PipelineError("the match decisions file must be an object with a decisions list")
    links: list[LinkDecision] = []
    no_links: list[NoLinkDecision] = []
    observations: list[ObservationDecision] = []
    for i, raw in enumerate(doc["decisions"]):
        where = f"decision #{i + 1}"
        if not isinstance(raw, dict) or raw.get("type") not in ("link", "no_link", "observation"):
            raise PipelineError(f"{where}: type must be link, no_link or observation")
        by, at = _text(raw, "confirmed_by", where), _text(raw, "confirmed_at", where)
        if raw["type"] == "observation":
            present, visibility = raw.get("present"), raw.get("visibility")
            if not isinstance(present, bool) or visibility not in VISIBILITIES:
                raise PipelineError(
                    f"{where}: present must be true or false and visibility one of "
                    f"{', '.join(VISIBILITIES)}"
                )
            note = raw.get("note")
            if note is not None and not isinstance(note, str):
                raise PipelineError(f"{where}: note must be text")
            observations.append(
                ObservationDecision(
                    _text(raw, "feature", where), _text(raw, "source", where),
                    present, visibility, note, by, at,
                )  # fmt: skip
            )
        elif raw["type"] == "link":
            links.append(LinkDecision(_pair(raw, where), by, at))
        else:
            no_links.append(NoLinkDecision(_pair(raw, where), by, at))
    conflict = {d.features for d in links} & {d.features for d in no_links}
    if conflict:
        a, b = sorted(conflict)[0]
        raise PipelineError(f"{a} and {b} are both linked and ruled out in the decisions file")
    return Decisions(tuple(links), tuple(no_links), tuple(observations))


# --- editing one feature's properties -----------------------------------------------------------


def strip_auto(props: dict[str, Any]) -> None:
    """Remove every `match_auto` observation and link (requirement 13.11). Person ones stay."""
    props["observations"] = [o for o in props["observations"] if o["method"] != AUTO]
    if "same_as" in props:
        kept = [link for link in props["same_as"] if link["method"] != AUTO]
        if kept:
            props["same_as"] = kept
        else:
            del props["same_as"]


def observation_from(props: dict[str, Any], source: str) -> dict[str, Any] | None:
    for o in props["observations"]:
        if o["source"] == source:
            return o
    return None


def has_origin_or_person(props: dict[str, Any], source: str) -> bool:
    """A feature and source that already have an origin or person observation: `match` writes
    nothing for them (requirement 13.10)."""
    o = observation_from(props, source)
    return o is not None and o["method"] in (ORIGIN, PERSON)


def add_observation(props: dict[str, Any], obs: dict[str, Any]) -> None:
    """Add an observation. At most one per source: the caller has checked there is none."""
    if observation_from(props, obs["source"]) is not None:
        raise PipelineError(f"internal: second observation from {obs['source']}")
    props["observations"].append(obs)


def add_link(props: dict[str, Any], link: dict[str, Any]) -> None:
    links = props.setdefault("same_as", [])
    if not any(existing["feature"] == link["feature"] for existing in links):
        links.append(link)


def auto_presence(source: str, matched_feature: str) -> dict[str, Any]:
    return {
        "source": source,
        "present": True,
        "visibility": "clear",
        "method": AUTO,
        "matched_feature": matched_feature,
    }


def auto_absence(source: str) -> dict[str, Any]:
    return {"source": source, "present": False, "visibility": "clear", "method": AUTO}


def auto_not_covered(source: str) -> dict[str, Any]:
    return {"source": source, "present": False, "visibility": "not_covered", "method": AUTO}


def sort_props(props: dict[str, Any], origin: str) -> None:
    """Observations: the origin source first, then by source id. Links: by feature id."""
    props["observations"].sort(key=lambda o: (o["source"] != origin, o["source"]))
    if "same_as" in props:
        props["same_as"].sort(key=lambda link: link["feature"])


# --- applying decisions -------------------------------------------------------------------------


@dataclass
class FeatureRef:
    id: str
    origin: str
    props: dict[str, Any]

    @property
    def published(self) -> bool:
        return bool(self.props["status"] == "published")


def _person_obs(source: str, present: bool, visibility: str, d: Any) -> dict[str, Any]:
    return {
        "source": source,
        "present": present,
        "visibility": visibility,
        "method": PERSON,
        "confirmed_by": d.confirmed_by,
        "confirmed_at": d.confirmed_at,
    }


def _set_person_observation(
    ref: FeatureRef, source: str, present: bool, visibility: str, d: Any, note: str | None
) -> None:
    existing = observation_from(ref.props, source)
    if existing is not None:
        if existing["method"] == ORIGIN:
            raise PipelineError(f"{ref.id}: {source} is its origin source; it cannot be decided")
        if existing["method"] == PERSON:
            if (existing["present"], existing["visibility"]) != (present, visibility):
                raise PipelineError(
                    f"{ref.id} already has a person observation from {source} that differs from "
                    "the decisions file. A person's observation is never changed by `match`; "
                    "edit the evidence file by hand if it was wrong."
                )
            return
    obs = _person_obs(source, present, visibility, d)
    if note:
        obs["note"] = note
    add_observation(ref.props, obs)


def apply_decisions(features: Mapping[str, FeatureRef], decisions: Decisions) -> None:
    """Apply `link` and `observation` decisions in place (`no_link` is read by the caller)."""
    for d in decisions.links:
        a, b = (features.get(i) for i in d.features)
        if a is None or b is None:
            missing = d.features[0] if a is None else d.features[1]
            raise PipelineError(f"link decision: {missing} is not a feature in data/evidence/")
        if not (a.published and b.published):
            raise PipelineError(f"link decision: {a.id} and {b.id} must both be published")
        if a.origin == b.origin:
            raise PipelineError(
                f"link decision: {a.id} and {b.id} are both from {a.origin}; two features on "
                "one source are a merge, not a link"
            )
        for x, y in ((a, b), (b, a)):
            add_link(
                x.props,
                {"feature": y.id, "method": PERSON,
                 "confirmed_by": d.confirmed_by, "confirmed_at": d.confirmed_at},
            )  # fmt: skip
            _set_person_observation(x, y.origin, True, "clear", d, None)
    for o in decisions.observations:
        ref = features.get(o.feature)
        if ref is None:
            raise PipelineError(f"observation decision: {o.feature} is not a feature")
        if not ref.published:
            raise PipelineError(f"observation decision: {o.feature} is not published")
        _set_person_observation(ref, o.source, o.present, o.visibility, o, o.note)
