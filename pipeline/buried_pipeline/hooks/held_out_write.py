"""The held-out write guard for the Kiro `PreToolUse` hook (spec 02 task 17.2, requirement 9).

Run as `uv --directory pipeline run python -m buried_pipeline.hooks.held_out_write`. Kiro writes the
hook event as JSON on standard input. When the tool is about to write under the extraction parameter
sets, the extraction tuning fixtures or the map area files, and the path or the text being written
names the held-out plate (`fip_v3_1935_232`), the script prints why on standard error and exits 2,
which blocks the write. Anything else exits 0.

The pytest guard (`tests/extract/test_held_out.py`, `test_maparea_held_out.py`) is the backstop for
writes this hook cannot see, such as writes made by shell commands.

`decide` is pure, so the tests can call it without standard input or exit codes.
"""

from __future__ import annotations

import json
import sys
from collections.abc import Mapping
from pathlib import Path, PurePosixPath
from typing import Any

from buried_pipeline.extract.params import HELD_OUT_PATTERNS
from buried_pipeline.paths import find_repo_root

# Folders (relative to the repository root, with a trailing slash) where the held-out plate must
# not appear: the parameter sets, the tuning fixtures and the map areas that extraction works in.
GUARDED_PREFIXES = (
    "pipeline/buried_pipeline/extract/params/",
    "pipeline/tests/fixtures/extract/",
    "data/control/map_area/",
)
PATH_KEYS = ("path", "file_path", "targetFile")
TEXT_KEYS = ("text", "content", "file_text", "newStr", "new_str")
EVENT_INPUT_KEYS = ("tool_input", "toolInput", "input", "parameters", "arguments")
BLOCK_EXIT = 2


def tool_input(event: Any) -> Mapping[str, Any] | None:
    """The tool's arguments inside a hook event, or the event itself when it is already flat."""
    if not isinstance(event, Mapping):
        return None
    for key in EVENT_INPUT_KEYS:
        inner = event.get(key)
        if isinstance(inner, Mapping):
            return inner
    return event


def target_path(args: Mapping[str, Any]) -> str | None:
    """The first of `path`, `file_path`, `targetFile` that holds a string."""
    for key in PATH_KEYS:
        value = args.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def written_text(args: Mapping[str, Any]) -> list[str]:
    """Every text field the write carries."""
    return [v for key in TEXT_KEYS if isinstance(v := args.get(key), str)]


def relative_to_root(path: str, root: Path) -> str | None:
    """The path as a posix string under `root`, or None when it is outside it. A relative path is
    resolved against `root`, not the working directory (which is `pipeline/` for the hook)."""
    candidate = Path(path).expanduser()
    if not candidate.is_absolute():
        candidate = root / candidate
    try:
        parts = candidate.resolve().relative_to(root.resolve()).parts
    except ValueError:
        return None
    return PurePosixPath(*parts).as_posix()


def mentions_held_out(*texts: str) -> bool:
    lowered = [t.lower() for t in texts]
    return any(p.lower() in t for p in HELD_OUT_PATTERNS for t in lowered)


def is_guarded(relative: str) -> bool:
    return any(relative.startswith(prefix) for prefix in GUARDED_PREFIXES)


def decide(event: Any, root: Path) -> str | None:
    """None to allow the write, or the message to print when it is blocked."""
    args = tool_input(event)
    path = target_path(args) if args is not None else None
    if args is None or path is None:
        return None
    relative = relative_to_root(path, root)
    if relative is None or not is_guarded(relative):
        return None
    if not mentions_held_out(relative, path, *written_text(args)):
        return None
    return (
        f"Blocked: {relative} is an extraction tuning file and this write mentions the "
        "held-out plate fip_v3_1935_232. Plate 232 (1935) is never used to tune extraction "
        "(product.md, evidence.md)."
    )


def main(stdin: str | None = None, root: Path | None = None) -> int:
    raw = sys.stdin.read() if stdin is None else stdin
    try:
        event = json.loads(raw)
        args = tool_input(event)
        recognised = args is not None and target_path(args) is not None
    except (json.JSONDecodeError, ValueError):
        event, recognised = None, False
    if not recognised:
        print("held_out_write: the hook event has no recognisable path; allowing", file=sys.stderr)
        return 0
    message = decide(event, root or find_repo_root())
    if message is None:
        return 0
    print(message, file=sys.stderr)
    return BLOCK_EXIT


if __name__ == "__main__":
    sys.exit(main())
