"""`buried validate [PATH ...]`: read the contract files under data/ and check them.

The only module of the Validator that does file I/O.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Sequence
from datetime import datetime
from pathlib import Path

from buried_pipeline.errors import PipelineError
from buried_pipeline.paths import Paths
from buried_pipeline.validate.dataset import LoadedFile, Report, validate_files
from buried_pipeline.validate.errors import ValidationError, err
from buried_pipeline.validate.schema import SchemaSet, def_for_path, load_schema

CONTRACT_DIRECTORIES = (
    ("evidence", "*.geojson"),
    ("control", "*.json"),
    ("control/map_area", "*.json"),
    ("alignment", "*.json"),
    ("tiles", "*.json"),
    ("present", "*.geojson"),
)


def contract_files(paths: Paths) -> list[Path]:
    """Every contract file under data/, in a fixed order. raw/, work/ and schema/ are never read."""
    found: list[Path] = []
    for name in ("sources.json", "project.json", "plate_manifest.json"):
        p = paths.data / name
        if p.is_file():
            found.append(p)
    for directory, pattern in CONTRACT_DIRECTORIES:
        d = paths.data / directory
        if d.is_dir():
            found.extend(sorted(p for p in d.glob(pattern) if p.is_file()))
    return found


def display_path(paths: Paths, p: Path) -> str:
    try:
        return p.resolve().relative_to(paths.root.resolve()).as_posix()
    except ValueError:
        return p.as_posix()


def read_files(
    paths: Paths, files: Sequence[Path]
) -> tuple[list[LoadedFile], list[ValidationError]]:
    loaded: list[LoadedFile] = []
    errors: list[ValidationError] = []
    for p in files:
        shown = display_path(paths, p)
        def_name = def_for_path(p, paths.data)
        if def_name is None:
            errors.append(err(shown, "/", "not a contract file (requirement 8.2 lists the paths)"))
            continue
        try:
            doc = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(err(shown, "/", f"not valid JSON: {exc}"))
            continue
        except OSError as exc:
            errors.append(err(shown, "/", f"cannot be read: {exc}"))
            continue
        loaded.append(LoadedFile(shown, p.stem, def_name, doc))
    return loaded, errors


def validate_would_be(
    paths: Paths,
    replacements: dict[Path, object],
    now: datetime,
    schema: SchemaSet | None = None,
) -> list[ValidationError]:
    """Validate the `data/` tree as it would be if each file in `replacements` (path to parsed
    document) took the place of the file on disk (or was added). Nothing is written.

    Reports only the errors on the replaced files, judged against the whole tree, as
    `buried validate PATH` does. This is the check publish runs before it writes (spec 02 req 10.8).
    """
    schema = schema or load_schema(paths.root)
    replaced = {p.resolve(): doc for p, doc in replacements.items()}
    on_disk = [p for p in contract_files(paths) if p.resolve() not in replaced]
    loaded, read_errors = read_files(paths, on_disk)
    shown: set[str] = set()
    for p, doc in replaced.items():
        def_name = def_for_path(p, paths.data)
        if def_name is None:
            read_errors.append(err(display_path(paths, p), "/", "not a contract file"))
            continue
        shown.add(display_path(paths, p))
        loaded.append(LoadedFile(display_path(paths, p), p.stem, def_name, doc))
    report = validate_files(loaded, schema, now)
    return sorted({e for e in [*report.errors, *read_errors] if e.path in shown})


def run_validate(
    paths: Paths,
    requested: Sequence[Path],
    now: datetime,
    out: Callable[[str], None] = print,
    schema: SchemaSet | None = None,
) -> Report:
    """Validate everything, report on the requested files (or on all of them).

    Cross-file checks always see the whole data/ tree, so a single file is judged against the
    same registry, alignment records and evidence as in a full run.
    """
    schema = schema or load_schema(paths.root)
    everything = contract_files(paths)
    wanted = {display_path(paths, p) for p in requested}
    for p in requested:
        if not p.is_file():
            raise PipelineError(f"No such file: {p}")
    to_read = list(dict.fromkeys([*everything, *requested]))
    loaded, read_errors = read_files(paths, to_read)

    report = validate_files(loaded, schema, now)
    errors = sorted({*report.errors, *read_errors})
    if wanted:
        errors = [e for e in errors if e.path in wanted]
        checked_files = [f for f in loaded if f.path in wanted]
        features = sum(
            len(f.doc["features"])
            for f in checked_files
            if f.def_name == "featureCollection" and isinstance(f.doc, dict)
            and isinstance(f.doc.get("features"), list)
        )
        files_checked = len(wanted)
    else:
        features = report.features_checked
        files_checked = len(loaded) + len(read_errors)

    for e in errors:
        out(e.format())
    if errors:
        failing = len({e.path for e in errors})
        out(f"FAILED: {len(errors)} errors in {failing} files "
            f"({files_checked} files, {features} features checked)")
    else:
        out(f"OK: {files_checked} files, {features} features checked")
    return Report(errors, files_checked, features)
