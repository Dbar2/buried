"""What the cross-file checks can see: the schema-valid contract files, grouped by kind.

Pure data. `run.py` fills it from disk; tests fill it in memory.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class Doc:
    """One schema-valid contract file. `path` is the display path (for example
    `data/evidence/fip_v3_1911_229.geojson`), `name` its file stem."""

    path: str
    name: str
    doc: dict[str, Any]


@dataclass
class Context:
    now: datetime
    sources: dict[str, dict[str, Any]] = field(default_factory=dict)
    project: dict[str, Any] | None = None
    alignment: dict[str, dict[str, Any]] = field(default_factory=dict)
    present: dict[str, dict[str, Any]] = field(default_factory=dict)

    @property
    def bounds(self) -> dict[str, float] | None:
        return self.project["bounds"] if self.project else None
