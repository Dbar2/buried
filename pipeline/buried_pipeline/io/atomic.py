"""Write-temp-then-rename, so a failed command leaves no partly written file."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any


def atomic_write_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    tmp = Path(tmp_name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


def atomic_write_text(path: Path, text: str) -> None:
    atomic_write_bytes(path, text.encode("utf-8"))


def dump_json(obj: Any) -> str:
    """Stable JSON text: two-space indent, UTF-8, trailing newline."""
    return json.dumps(obj, indent=2, ensure_ascii=False) + "\n"


def atomic_write_json(path: Path, obj: Any) -> None:
    atomic_write_text(path, dump_json(obj))
