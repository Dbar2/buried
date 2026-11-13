"""The error body of the Service API (spec 04 design "Conventions") and its HTTP statuses."""

from __future__ import annotations

from typing import Any

STATUS = {
    "invalid_request": 422,
    "version_mismatch": 409,
    "data_version_mismatch": 409,
    "not_allowed": 403,
    "too_large": 413,
    "rate_limited": 429,
    "not_found": 404,
    "no_georeferencing": 422,
    "validation_failed": 422,
    "upstream_failed": 502,
    "timeout": 504,
}


class ServiceError(Exception):
    """A refusal the caller can act on. Becomes `{"error": {code, message, details}}`."""

    def __init__(self, code: str, message: str, details: list[Any] | None = None,
                 headers: dict[str, str] | None = None) -> None:  # fmt: skip
        assert code in STATUS, code
        self.code = code
        self.message = message
        self.details = details or []
        self.headers = headers or {}
        super().__init__(message)

    @property
    def status(self) -> int:
        return STATUS[self.code]

    def body(self) -> dict[str, Any]:
        return {"error": {"code": self.code, "message": self.message, "details": self.details}}
