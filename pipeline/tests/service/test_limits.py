"""Rate limits and the extraction concurrency limit (spec 04 task 3.2, requirement 3.6)."""

from __future__ import annotations

import threading

import pytest

from buried_pipeline.service.errors import ServiceError
from buried_pipeline.service.limits import HOUR_S, Limiter


class Clock:
    def __init__(self, now: float = 10 * HOUR_S) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now


def test_the_request_over_the_limit_is_refused_with_a_retry_time() -> None:
    clock = Clock(10 * HOUR_S + 600)
    limiter = Limiter(clock, hourly={"extract": 2})
    limiter.hit("extract", "1.2.3.4")
    limiter.hit("extract", "1.2.3.4")
    with pytest.raises(ServiceError) as raised:
        limiter.hit("extract", "1.2.3.4")
    e = raised.value
    assert e.code == "rate_limited" and e.status == 429
    assert e.details == [{"retry_after_s": 3000}]  # the rest of the hour
    assert e.headers == {"Retry-After": "3000"}


def test_addresses_and_groups_are_counted_apart() -> None:
    limiter = Limiter(Clock(), hourly={"extract": 1, "align": 1})
    limiter.hit("extract", "a")
    limiter.hit("extract", "b")
    limiter.hit("align", "a")
    with pytest.raises(ServiceError):
        limiter.hit("extract", "a")


def test_the_count_starts_again_in_the_next_hour() -> None:
    clock = Clock()
    limiter = Limiter(clock, hourly={"extract": 1})
    limiter.hit("extract", "a")
    clock.now += HOUR_S
    limiter.hit("extract", "a")


def test_expired_counters_are_dropped() -> None:
    clock = Clock()
    limiter = Limiter(clock, hourly={"extract": 5})
    for who in "abc":
        limiter.hit("extract", who)
    clock.now += 2 * HOUR_S
    limiter.hit("extract", "d")
    assert list(limiter._counts) == [("extract", "d")]  # nothing about the earlier hour is kept


def test_a_third_extraction_waits_then_gets_429() -> None:
    limiter = Limiter(Clock(), concurrent_extractions=2, extract_wait_s=0.05)
    with limiter.extraction_slot(), limiter.extraction_slot():
        with pytest.raises(ServiceError) as raised, limiter.extraction_slot():
            pass
        assert raised.value.code == "rate_limited"
    with limiter.extraction_slot():  # a slot is free again once the others finish
        pass


def test_a_waiting_extraction_runs_when_a_slot_frees() -> None:
    limiter = Limiter(Clock(), concurrent_extractions=1, extract_wait_s=5.0)
    started = threading.Event()
    release = threading.Event()

    def hold() -> None:
        with limiter.extraction_slot():
            started.set()
            release.wait(5)

    t = threading.Thread(target=hold)
    t.start()
    started.wait(5)
    threading.Timer(0.05, release.set).start()
    with limiter.extraction_slot():
        pass
    t.join()


def test_the_description_lists_the_limits_as_whole_numbers() -> None:
    d = Limiter(Clock()).describe()
    assert d["extract"] == 30 and d["concurrent_extractions"] == 2 and d["label_daily_cap"] == 1000
    assert all(isinstance(v, int) for v in d.values())


def test_the_daily_label_cap_is_for_the_whole_service_and_resets_at_utc_midnight() -> None:
    clock = Clock(10 * 86400 + 80000)  # 6400 s before midnight UTC
    limiter = Limiter(clock, label_daily_cap=2)
    limiter.hit_label()
    limiter.hit_label()
    with pytest.raises(ServiceError) as raised:
        limiter.hit_label()
    assert raised.value.code == "rate_limited" and raised.value.details == [{"retry_after_s": 6400}]
    clock.now += 6400
    limiter.hit_label()  # a new day
