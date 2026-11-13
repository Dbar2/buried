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
    def plate_manifest(self) -> Path:
        """The committed record of each registered plate's download (`buried manifest`)."""
        return self.data / "plate_manifest.json"

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

    @property
    def map_area_dir(self) -> Path:
        return self.control_dir / "map_area"

    def map_area_file(self, source_id: str) -> Path:
        return self.map_area_dir / f"{source_id}.json"

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

    def proposals_file(self, source_id: str) -> Path:
        return self.work / "proposals" / f"{source_id}.geojson"

    def extract_preview(self, source_id: str) -> Path:
        return self.work / "extract" / f"{source_id}_preview.jpg"

    def review_file(self, source_id: str) -> Path:
        """The reviewer's decisions file, written by a person (or by the Studio)."""
        return self.work / "review" / f"{source_id}.json"

    def evidence_file(self, source_id: str) -> Path:
        return self.data / "evidence" / f"{source_id}.geojson"

    def tile_sidecar(self, source_id: str) -> Path:
        return self.data / "tiles" / f"{source_id}.json"

    @property
    def match_decisions(self) -> Path:
        """The match decisions file, written by a person (or by the Studio)."""
        return self.work / "review" / "match.json"

    @property
    def match_review(self) -> Path:
        return self.work / "match" / "review.json"

    @property
    def match_pairwise(self) -> Path:
        """The pairwise alignment figures the last `match` run used (design.md "Pairwise error")."""
        return self.work / "match" / "pairwise.json"
