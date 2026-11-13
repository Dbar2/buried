"""Service configuration from environment variables (spec 04 design "Configuration").

Only the variables this version of the Service uses are read. A variable that names something not
built yet is refused at startup instead of being ignored, so a deployment never claims a feature
it lacks.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from buried_pipeline.errors import PipelineError
from buried_pipeline.paths import find_repo_root

MAX_BODY_BYTES = 10 * 1024 * 1024  # requirement 3.4


class ConfigError(PipelineError):
    """The environment asks for something the Service will not do."""


@dataclass(frozen=True)
class Config:
    root: Path
    allowed_origins: tuple[str, ...] = ()
    test_mode: bool = False
    label_provider: str = "none"
    max_body_bytes: int = MAX_BODY_BYTES

    @classmethod
    def from_env(cls, env: Mapping[str, str]) -> Config:
        test_mode = env.get("BURIED_TEST_MODE") == "1"
        if env.get("BURIED_TEST_PLATES_DIR") and not test_mode:
            raise ConfigError("BURIED_TEST_PLATES_DIR is set without BURIED_TEST_MODE=1; the "
                              "Service refuses to start (test plates are for end-to-end tests)")
        if env.get("BURIED_TEST_PLATES_DIR"):
            raise ConfigError("BURIED_TEST_PLATES_DIR is not supported yet: the Service does not "
                              "serve test plates in this version")
        provider = env.get("BURIED_LABEL_PROVIDER", "none") or "none"
        if provider != "none":
            raise ConfigError(f"BURIED_LABEL_PROVIDER={provider!r} is not supported yet: label "
                              "assist is not built, so the only provider is 'none'")
        root = Path(env["BURIED_REPO_ROOT"]).resolve() if env.get("BURIED_REPO_ROOT") else None
        origins = tuple(
            o.strip() for o in env.get("BURIED_ALLOWED_ORIGINS", "").split(",") if o.strip()
        )
        return cls(
            root=root or find_repo_root(),
            allowed_origins=origins,
            test_mode=test_mode,
            label_provider=provider,
        )
