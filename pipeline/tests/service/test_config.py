"""Startup configuration (spec 04 task 3.1): what the environment may ask for."""

from __future__ import annotations

from pathlib import Path

import pytest

from buried_pipeline.service.app import create_app
from buried_pipeline.service.config import Config, ConfigError


def test_the_defaults_are_the_safe_ones(tmp_path: Path) -> None:
    c = Config.from_env({"BURIED_REPO_ROOT": str(tmp_path)})
    assert c.root == tmp_path.resolve()
    assert c.allowed_origins == () and not c.test_mode and c.label_provider == "none"
    assert c.max_body_bytes == 10 * 1024 * 1024


def test_origins_are_split_and_trimmed(tmp_path: Path) -> None:
    env = {"BURIED_REPO_ROOT": str(tmp_path),
           "BURIED_ALLOWED_ORIGINS": " https://a.example , https://b.example ,"}  # fmt: skip
    assert Config.from_env(env).allowed_origins == ("https://a.example", "https://b.example")


def test_test_plates_without_test_mode_refuse_to_start(tmp_path: Path) -> None:
    with pytest.raises(ConfigError, match="BURIED_TEST_MODE=1"):
        Config.from_env({"BURIED_REPO_ROOT": str(tmp_path), "BURIED_TEST_PLATES_DIR": "/x"})


def test_test_plates_are_refused_even_in_test_mode_until_they_are_built(tmp_path: Path) -> None:
    env = {"BURIED_REPO_ROOT": str(tmp_path), "BURIED_TEST_MODE": "1",
           "BURIED_TEST_PLATES_DIR": "/x"}  # fmt: skip
    with pytest.raises(ConfigError, match="not supported yet"):
        Config.from_env(env)


def test_a_label_provider_that_is_not_built_is_refused_not_ignored(tmp_path: Path) -> None:
    with pytest.raises(ConfigError, match="not supported yet"):
        Config.from_env({"BURIED_REPO_ROOT": str(tmp_path), "BURIED_LABEL_PROVIDER": "bedrock"})


def test_test_mode_shows_in_health(tmp_path: Path) -> None:
    from tests.service.helpers import client_for, make_service_world

    sw = make_service_world(tmp_path)
    config = Config(root=sw.root, test_mode=True)
    from fastapi.testclient import TestClient

    app = create_app(config=config, snapshot=sw.snapshot, env={})
    assert TestClient(app).get("/v1/health").json()["test_mode"] is True
    assert "test_mode" not in client_for(sw).get("/v1/health").json()
