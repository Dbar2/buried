"""The one error type every Validator check returns."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, order=True)
class ValidationError:
    """One problem in one contract file. `pointer` is a JSON pointer into the file."""

    path: str
    feature_id: str
    pointer: str
    reason: str

    def format(self) -> str:
        where = f" [{self.feature_id}]" if self.feature_id else ""
        return f"{self.path}{where} {self.pointer}: {self.reason}"


def err(path: str, pointer: str, reason: str, feature_id: str | None = None) -> ValidationError:
    return ValidationError(path, feature_id or "", pointer, reason)
