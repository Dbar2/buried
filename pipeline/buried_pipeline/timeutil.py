"""Time is passed in as an argument everywhere except here, at the CLI edge."""

from __future__ import annotations

from datetime import UTC, datetime


def utc_now() -> datetime:
    return datetime.now(UTC).replace(microsecond=0)


def rfc3339(moment: datetime) -> str:
    """UTC RFC 3339 text with a Z suffix. Naive datetimes are taken to be UTC."""
    if moment.tzinfo is not None:
        moment = moment.astimezone(UTC)
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")
