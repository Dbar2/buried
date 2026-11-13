"""Per-address hourly limits and the extraction concurrency limit (spec 04 design "Limits").

In memory only. A counter holds a count and the hour it belongs to, never a request, and is dropped
when its hour ends (requirement 1.4). The clock is injected so tests do not wait.
"""

from __future__ import annotations

import math
import threading
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager

from buried_pipeline.service.errors import ServiceError

HOUR_S = 3600
DAY_S = 86400
LABEL_DAILY_CAP = 1000  # BURIED_LABEL_DAILY_CAP's default (design "Configuration")

# Requests per address per hour, by endpoint group (design "Limits").
HOURLY_LIMITS: dict[str, int] = {
    "plates_fetch": 10,
    "uploads": 5,
    "align": 900,
    "extract": 30,
    "labels": 120,
    "match_publish": 120,
    "image_crop": 3000,
}
MAX_CONCURRENT_EXTRACTIONS = 2
EXTRACT_WAIT_S = 10.0


class Limiter:
    def __init__(
        self,
        clock: Callable[[], float] = time.time,
        hourly: dict[str, int] | None = None,
        concurrent_extractions: int = MAX_CONCURRENT_EXTRACTIONS,
        extract_wait_s: float = EXTRACT_WAIT_S,
        label_daily_cap: int = LABEL_DAILY_CAP,
    ) -> None:
        self._clock = clock
        self.hourly = dict(HOURLY_LIMITS if hourly is None else hourly)
        self.label_daily_cap = label_daily_cap
        self._label_day: tuple[int, int] = (-1, 0)  # (UTC day, count)
        self._counts: dict[tuple[str, str], tuple[int, int]] = {}  # (group, address) -> (hour, n)
        self._lock = threading.Lock()
        self._slots = threading.BoundedSemaphore(concurrent_extractions)
        self._extract_wait_s = extract_wait_s
        self.concurrent_extractions = concurrent_extractions

    def describe(self) -> dict[str, int]:
        return {
            **self.hourly,
            "concurrent_extractions": self.concurrent_extractions,
            "label_daily_cap": self.label_daily_cap,
        }

    def hit(self, group: str, address: str) -> None:
        """Count one request. Raises `rate_limited` with the time to wait when over the limit."""
        limit = self.hourly[group]
        now = self._clock()
        hour = int(now // HOUR_S)
        with self._lock:
            self._counts = {k: v for k, v in self._counts.items() if v[0] == hour}
            _, used = self._counts.get((group, address), (hour, 0))
            if used >= limit:
                retry = max(1, math.ceil((hour + 1) * HOUR_S - now))
                raise ServiceError(
                    "rate_limited",
                    f"too many {group} requests this hour (limit {limit}); try again in "
                    f"{retry} s",
                    [{"retry_after_s": retry}],
                    {"Retry-After": str(retry)},
                )
            self._counts[(group, address)] = (hour, used + 1)

    def hit_label(self) -> None:
        """Count one label request against the Service-wide daily cap (UTC day). Label assist is
        not built yet, so nothing calls this; it is here so the cap exists before the endpoint."""
        now = self._clock()
        day = int(now // DAY_S)
        with self._lock:
            seen_day, used = self._label_day
            if seen_day != day:
                seen_day, used = day, 0
            if used >= self.label_daily_cap:
                retry = max(1, math.ceil((day + 1) * DAY_S - now))
                raise ServiceError(
                    "rate_limited",
                    f"the daily limit of {self.label_daily_cap} label readings is used up; "
                    f"try again in {retry} s",
                    [{"retry_after_s": retry}],
                    {"Retry-After": str(retry)},
                )
            self._label_day = (seen_day, used + 1)

    @contextmanager
    def extraction_slot(self) -> Iterator[None]:
        """At most `concurrent_extractions` run at once; others wait, then get 429."""
        if not self._slots.acquire(timeout=self._extract_wait_s):
            raise ServiceError(
                "rate_limited",
                "the Service is busy extracting for other visitors; try again shortly",
                [{"retry_after_s": 10}],
                {"Retry-After": "10"},
            )
        try:
            yield
        finally:
            self._slots.release()
