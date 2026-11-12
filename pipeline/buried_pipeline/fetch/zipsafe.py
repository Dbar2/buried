"""Safe zip extraction: nothing is written until every entry name has been checked."""

from __future__ import annotations

import stat
import zipfile
from pathlib import Path, PurePosixPath, PureWindowsPath

from buried_pipeline.errors import PipelineError

MAX_UNCOMPRESSED_BYTES = 4 * 1024**3
_COPY_CHUNK = 1024 * 1024


def entry_problem(name: str) -> str | None:
    """Why a zip entry name is refused, or None when it is safe to extract.

    Refused: empty names, NUL bytes, absolute paths (POSIX, drive-letter or UNC), and any `..`
    component, with either slash style.
    """
    if not name:
        return "empty entry name"
    if "\x00" in name:
        return "entry name contains a NUL byte"
    if name.startswith(("/", "\\")):
        return "absolute path"
    if PurePosixPath(name).is_absolute() or PureWindowsPath(name).is_absolute():
        return "absolute path"
    if PureWindowsPath(name).drive:
        return "drive letter in path"
    parts = name.replace("\\", "/").split("/")
    if ".." in parts:
        return "'..' component"
    return None


def check_zip(zf: zipfile.ZipFile) -> list[zipfile.ZipInfo]:
    """Return the entries to extract, or raise naming the first bad one. Writes nothing."""
    infos = zf.infolist()
    total = 0
    seen: set[str] = set()
    for info in infos:
        problem = entry_problem(info.filename)
        if problem:
            raise PipelineError(f"Refusing zip entry {info.filename!r}: {problem}")
        mode = info.external_attr >> 16
        if mode and stat.S_ISLNK(mode):
            raise PipelineError(f"Refusing zip entry {info.filename!r}: symbolic link")
        normalised = info.filename.replace("\\", "/")
        if normalised in seen:
            raise PipelineError(f"Refusing zip: duplicate entry {info.filename!r}")
        seen.add(normalised)
        total += info.file_size
    if total > MAX_UNCOMPRESSED_BYTES:
        raise PipelineError(f"Refusing zip: {total} bytes uncompressed exceeds the limit")
    return infos


def extract_safely(zip_path: Path, dest: Path) -> list[str]:
    """Extract `zip_path` into `dest`. Returns the relative POSIX paths of extracted files."""
    dest_resolved = dest.resolve()
    try:
        zf = zipfile.ZipFile(zip_path)
    except zipfile.BadZipFile as exc:
        raise PipelineError(f"Not a valid zip file: {zip_path}") from exc
    extracted: list[str] = []
    with zf:
        infos = check_zip(zf)
        for info in infos:
            rel = info.filename.replace("\\", "/")
            target = (dest / rel).resolve()
            if target != dest_resolved and dest_resolved not in target.parents:
                raise PipelineError(f"Refusing zip entry {info.filename!r}: escapes {dest}")
            if info.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info) as src, target.open("wb") as out:
                while chunk := src.read(_COPY_CHUNK):
                    out.write(chunk)
            extracted.append(rel)
    return sorted(extracted)
