"""Repository root discovery and the standard paths under it."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from buried_pipeline.errors import PipelineError


def find_repo_root(start: Path | None = None) -> Path:
    """Nearest ancestor of `start` (default: working directory) that contains `.kiro/`."""
    here = (start or Path.cwd()).resolve()
    for candidate in (here, *here.parents):
        if (candidate / ".kiro").is_dir():
            return candidate
    raise PipelineError(f"No repository root found above {here} (looked for a .kiro/ directory)")


@dataclass(frozen=True)
class Paths:
    root: Path

    @property
    def data(self) -> Path:
        return self.root / "data"

    @property
    def sources_json(self) -> Path:
        return self.data / "sources.json"

    @property
    def project_json(self) -> Path:
        return self.data / "project.json"

    @property
    def raw(self) -> Path:
        return self.data / "raw"

    @property
    def manifest(self) -> Path:
        return self.raw / "manifest.json"

    @property
    def work(self) -> Path:
        return self.data / "work"

    @property
    def inspect_dir(self) -> Path:
        return self.work / "inspect"

    @property
    def present_dir(self) -> Path:
        return self.data / "present"

    @property
    def control_dir(self) -> Path:
        return self.data / "control"

    @property
    def alignment_dir(self) -> Path:
        return self.data / "alignment"

    def raw_source_dir(self, source_id: str) -> Path:
        return self.raw / source_id

    def raw_present_dir(self, source_id: str) -> Path:
        return self.raw / "present" / source_id

    def inspect_report(self, source_id: str) -> Path:
        return self.inspect_dir / f"{source_id}.json"

    def present_layer(self, source_id: str) -> Path:
        return self.present_dir / f"{source_id}.geojson"

    def control_file(self, source_id: str) -> Path:
        return self.control_dir / f"{source_id}.json"

    def alignment_record(self, source_id: str) -> Path:
        return self.alignment_dir / f"{source_id}.json"
