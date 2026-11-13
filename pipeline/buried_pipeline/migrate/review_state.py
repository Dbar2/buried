"""Migration to evidence schema 1.2.0: give every feature `provenance.review` (spec 06 req 9).

Run once over `data/evidence/*.geojson`:
`uv --directory pipeline run python -m buried_pipeline.migrate.review_state [--dry-run]`.

A feature that already has a `review` keeps it, so a second run changes nothing. Otherwise:

- `draft_hand` when its publishing record (`provenance.confirmed_by`) names a hand tracing or a
  gate draft ("tracing by hand", "gate draft");
- `draft_rule` for everything else, merged and rejected features included.

No feature becomes `reviewed`: a named person reviews in person (spec 06 task M1). `confirmed_by`
and `confirmed_at` are left as they are.
"""

from __future__ import annotations

import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from buried_pipeline.paths import Paths, find_repo_root
from buried_pipeline.publish.build import canonical_text
from buried_pipeline.schema_version import SCHEMA_VERSION

HAND_MARKERS = ("tracing by hand", "gate draft")


def _version(text: str) -> tuple[int, ...]:
    return tuple(int(n) for n in text.split("."))


def review_for(provenance: dict[str, Any]) -> dict[str, str]:
    by = provenance.get("confirmed_by", "").lower()
    return {"state": "draft_hand" if any(m in by for m in HAND_MARKERS) else "draft_rule"}


def migrate_document(doc: dict[str, Any]) -> tuple[dict[str, Any], int]:
    """The document with `review` on every feature and the schema version raised to at least the
    current one, and how many features were given a review state. The input is not changed."""
    out = json.loads(json.dumps(doc))
    added = 0
    for feature in out["features"]:
        provenance = feature["properties"]["provenance"]
        if "review" not in provenance:
            provenance["review"] = review_for(provenance)
            added += 1
    if _version(out["schema_version"]) < _version(SCHEMA_VERSION):
        out["schema_version"] = SCHEMA_VERSION
    return out, added


def migrate_files(files: Sequence[Path], dry_run: bool = False) -> dict[Path, int]:
    """Migrate each evidence file in place (unless `dry_run`). Returns features changed per file."""
    changed: dict[Path, int] = {}
    for path in files:
        doc = json.loads(path.read_text(encoding="utf-8"))
        new, added = migrate_document(doc)
        changed[path] = added
        text = canonical_text(new)
        if not dry_run and text != path.read_text(encoding="utf-8"):
            path.write_text(text, encoding="utf-8")
    return changed


def main(argv: Sequence[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    dry_run = "--dry-run" in args
    paths = Paths(find_repo_root())
    files = sorted(paths.data.joinpath("evidence").glob("*.geojson"))
    for path, added in migrate_files(files, dry_run).items():
        print(f"{path.name}: {added} features given a review state")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
