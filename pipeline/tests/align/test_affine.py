from __future__ import annotations

import pytest

from buried_pipeline.align.affine import (
    NotInvertible,
    UnstableFit,
    apply_affine,
    fit_affine,
    fit_local_affine,
    invert_affine,
    is_stable,
    stability_ratio,
)

T = (0.05, 0.002, 630000.0, 0.001, -0.05, 4834000.0)
SPREAD = [(100.0, 100.0), (9000.0, 200.0), (8800.0, 7000.0), (300.0, 6800.0), (4500.0, 3500.0)]


def test_apply_and_exact_recovery() -> None:
    targets = [apply_affine(T, x, y) for x, y in SPREAD]
    fitted = fit_affine(SPREAD, targets)
    assert fitted == pytest.approx(T, abs=1e-9)


def test_three_points_determine_an_affine_exactly() -> None:
    pts = SPREAD[:3]
    targets = [apply_affine(T, x, y) for x, y in pts]
    assert fit_affine(pts, targets) == pytest.approx(T, abs=1e-9)


def test_invert_round_trip() -> None:
    inv = invert_affine(T)
    x, y = apply_affine(inv, *apply_affine(T, 1234.5, 6789.25))
    assert (x, y) == pytest.approx((1234.5, 6789.25), abs=1e-6)


def test_singular_affine_is_not_invertible() -> None:
    with pytest.raises(NotInvertible):
        invert_affine((1.0, 2.0, 0.0, 2.0, 4.0, 0.0))


def test_collinear_points_are_unstable() -> None:
    line = [(0.0, 0.0), (100.0, 100.0), (200.0, 200.0), (300.0, 300.0)]
    assert stability_ratio(line) == pytest.approx(0.0, abs=1e-12)
    assert not is_stable(line)
    with pytest.raises(UnstableFit, match="close to a line"):
        fit_affine(line, [(x, y) for x, y in line])


def test_narrow_spread_is_unstable_and_wider_is_stable() -> None:
    # Long axis 1000, short axis 40: ratio 0.04 < 0.05.
    narrow = [(0.0, 0.0), (1000.0, 0.0), (0.0, 40.0), (1000.0, 40.0)]
    assert stability_ratio(narrow) == pytest.approx(0.04)
    assert not is_stable(narrow)
    wide = [(0.0, 0.0), (1000.0, 0.0), (0.0, 60.0), (1000.0, 60.0)]
    assert is_stable(wide)


def test_stability_is_scale_invariant() -> None:
    a = stability_ratio(SPREAD)
    b = stability_ratio([(x * 1000, y * 1000) for x, y in SPREAD])
    assert a == pytest.approx(b)


def test_too_few_or_duplicate_points() -> None:
    with pytest.raises(UnstableFit):
        fit_affine(SPREAD[:2], [(0.0, 0.0), (1.0, 1.0)])
    with pytest.raises(UnstableFit):
        fit_affine([(5.0, 5.0)] * 4, [(0.0, 0.0)] * 4)
    with pytest.raises(ValueError, match="differ in length"):
        fit_affine(SPREAD, [(0.0, 0.0)])


def test_least_squares_averages_noise() -> None:
    targets = [apply_affine(T, x, y) for x, y in SPREAD]
    noisy = [(e + d, n) for (e, n), d in zip(targets, [0.3, -0.3, 0.3, -0.3, 0.0], strict=True)]
    fitted = fit_affine(SPREAD, noisy)
    resid = [
        (apply_affine(fitted, x, y)[0] - e) for (x, y), (e, _n) in zip(SPREAD, noisy, strict=True)
    ]
    assert abs(sum(resid)) < 1e-6  # least squares residuals sum to zero with an intercept


def test_local_affine_matches_the_six_coefficient_form() -> None:
    targets = [apply_affine(T, x, y) for x, y in SPREAD]
    local = fit_local_affine(SPREAD, targets)
    assert local.to_affine6() == pytest.approx(T, abs=1e-9)
    for (x, y), q in zip(SPREAD, targets, strict=True):
        assert local.apply(x, y) == pytest.approx(q, abs=1e-8)
