"""The `buried` command line. Argument parsing and dispatch only; no logic lives here."""

from __future__ import annotations

import argparse
import sys
from collections.abc import Callable, Sequence
from datetime import datetime
from pathlib import Path

from buried_pipeline import __version__
from buried_pipeline.errors import PipelineError
from buried_pipeline.io.http import HttpClient, RealHttpClient
from buried_pipeline.io.registry import load_registry
from buried_pipeline.paths import Paths, find_repo_root
from buried_pipeline.timeutil import utc_now

NOT_IMPLEMENTED = ("extract", "publish", "match")
HttpFactory = Callable[[], HttpClient]


def _root_parent() -> argparse.ArgumentParser:
    parent = argparse.ArgumentParser(add_help=False)
    parent.add_argument(
        "--root",
        type=Path,
        default=argparse.SUPPRESS,
        help="repository root (default: nearest ancestor containing .kiro/)",
    )
    return parent


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="buried", description="Buried pipeline")
    parser.add_argument("--version", action="version", version=f"buried {__version__}")
    parser.add_argument("--root", type=Path, default=None, help="repository root")
    parent = _root_parent()
    sub = parser.add_subparsers(dest="command", required=True, metavar="COMMAND")

    fetch = sub.add_parser("fetch", parents=[parent], help="download the registered plates")
    fetch.add_argument("source_ids", nargs="*", metavar="SOURCE_ID")
    fetch.add_argument(
        "--aerial-candidates",
        action="store_true",
        help="list 1947 aerial records covering the plates (not implemented yet)",
    )

    inspect = sub.add_parser("inspect", parents=[parent], help="report raster georeferencing")
    inspect.add_argument("source_ids", nargs="*", metavar="SOURCE_ID")
    inspect.add_argument(
        "--propose-origin",
        action="store_true",
        help="print the project origin and bounds derived from the plates (writes nothing)",
    )

    present = sub.add_parser(
        "present", parents=[parent], help="clip the present-day City of Toronto layers"
    )
    present.add_argument("source_ids", nargs="*", metavar="SOURCE_ID")
    present.add_argument(
        "--recheck",
        action="store_true",
        help="download again and compare with the committed layer",
    )

    align = sub.add_parser(
        "align-check", parents=[parent], help="measure a raster's alignment error"
    )
    align.add_argument("source_id", metavar="SOURCE_ID")

    crops = sub.add_parser(
        "control-crops",
        parents=[parent],
        help="write PNG crops around each City intersection inside a plate, for picking points",
    )
    crops.add_argument("source_id", metavar="SOURCE_ID")

    tile = sub.add_parser(
        "tile", parents=[parent], help="write each plate as a light JPEG with exact corners"
    )
    tile.add_argument("source_ids", nargs="*", metavar="SOURCE_ID")

    validate = sub.add_parser(
        "validate",
        parents=[parent],
        help="check the contract files under data/ against the Schema and the cross-file rules",
    )
    validate.add_argument("paths", nargs="*", type=Path, metavar="PATH")

    for name in NOT_IMPLEMENTED:
        stub = sub.add_parser(name, parents=[parent], help="not implemented yet")
        stub.add_argument("rest", nargs="*")
    return parser


def _paths(root: Path | None) -> Paths:
    return Paths(root.resolve() if root else find_repo_root())


def main(
    argv: Sequence[str] | None = None,
    *,
    http_factory: HttpFactory | None = None,
    now: Callable[[], datetime] = utc_now,
) -> int:
    args = build_parser().parse_args(argv)
    command: str = args.command
    if command in NOT_IMPLEMENTED:
        print(f"buried {command}: not implemented yet", file=sys.stderr)
        return 2
    try:
        return _dispatch(command, args, http_factory or RealHttpClient, now)
    except PipelineError as exc:
        print(f"buried {command}: {exc}", file=sys.stderr)
        return 1


def _dispatch(
    command: str, args: argparse.Namespace, http_factory: HttpFactory, now: Callable[[], datetime]
) -> int:
    paths = _paths(args.root)
    if command == "validate":
        from buried_pipeline.validate.run import run_validate

        report = run_validate(paths, [p.resolve() for p in args.paths], now())
        return 1 if report.errors else 0

    registry = load_registry(paths.sources_json)

    if command == "fetch":
        if args.aerial_candidates:
            print("buried fetch --aerial-candidates: not implemented yet", file=sys.stderr)
            return 2
        from buried_pipeline.fetch.plates import fetch_plates

        results = fetch_plates(paths, registry, http_factory(), list(args.source_ids), now())
        for r in results:
            if r.status == "up_to_date":
                print(f"{r.source}: up to date")
            else:
                print(f"{r.source}: downloaded {r.zip_bytes} bytes, {r.files} files extracted")
        return 0

    if command == "inspect":
        from buried_pipeline.inspect.run import run_inspect

        run_inspect(paths, registry, list(args.source_ids), args.propose_origin)
        return 0

    if command == "present":
        from buried_pipeline.present.run import run_present

        run_present(paths, registry, http_factory(), list(args.source_ids), args.recheck, now())
        return 0

    if command == "align-check":
        from buried_pipeline.align.run import run_align_check

        run_align_check(paths, registry, args.source_id, now())
        return 0

    if command == "tile":
        from buried_pipeline.tile.run import run_tile

        run_tile(paths, registry, list(args.source_ids))
        return 0

    if command == "control-crops":
        from buried_pipeline.controlcrops.run import run_control_crops

        run_control_crops(paths, registry, args.source_id)
        return 0

    raise PipelineError(f"Unknown command {command}")  # pragma: no cover
