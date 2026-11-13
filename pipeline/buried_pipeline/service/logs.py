"""Keep request content and credentials out of the Service's log (spec 04 requirement 3.8).

The Service logs a method, a path, a status and a time, and the kind of an unexpected error.
This filter is the second line: a record that would carry a credential value is replaced, and a
record that carries bytes or a very long string is cut down to its size.
"""

from __future__ import annotations

import logging
from collections.abc import Mapping

CREDENTIAL_VARIABLES = ("AWS_SECRET_ACCESS_KEY", "AWS_ACCESS_KEY_ID", "AWS_SESSION_TOKEN")
MAX_ARG_CHARS = 200


class RedactingFilter(logging.Filter):
    def __init__(self, env: Mapping[str, str]) -> None:
        super().__init__()
        self._secrets = tuple(v for k in CREDENTIAL_VARIABLES if (v := env.get(k)))

    def filter(self, record: logging.LogRecord) -> bool:
        if record.args:
            args = record.args if isinstance(record.args, tuple) else (record.args,)
            record.args = tuple(self._clean(a) for a in args)
        record.msg = self._clean(record.msg)
        record.exc_info = None  # a traceback can quote request content
        record.exc_text = None
        return True

    def _clean(self, value: object) -> object:
        if isinstance(value, bytes | bytearray):
            return f"<{len(value)} bytes>"
        if isinstance(value, str):
            for secret in self._secrets:
                value = str(value).replace(secret, "[redacted]")
            if len(value) > MAX_ARG_CHARS:
                return f"<{len(value)} characters>"
        return value
