from __future__ import annotations

import pytest
from pyproj import Transformer

from buried_pipeline.align.supplied import supplied_mapping

T = (0.1, 0.0, 630000.0, 0.0, -0.1, 4834000.0)


def test_26917_is_affine_only() -> None:
    mapping = supplied_mapping(T, "EPSG:26917")
    assert mapping.predict(0, 0) == pytest.approx((630000.0, 4834000.0))
    assert mapping.predict(100, 50) == pytest.approx((630010.0, 4833995.0))
    assert mapping.crs == "EPSG:26917"
    assert mapping.operation


def test_web_mercator_reprojects_to_26917() -> None:
    e, n = Transformer.from_crs("EPSG:26917", "EPSG:3857", always_xy=True).transform(
        630000.0, 4834000.0
    )
    mapping = supplied_mapping((1.0, 0.0, e, 0.0, -1.0, n), "EPSG:3857")
    assert mapping.predict(0, 0) == pytest.approx((630000.0, 4834000.0), abs=1e-4)
    # One mercator metre east is about cos(lat) ground metres.
    east, north = mapping.predict(100, 0)
    assert 70.0 < east - 630000.0 < 80.0
