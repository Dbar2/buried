"""One error type for every expected failure. The CLI prints it and exits 1."""


class PipelineError(Exception):
    """A command failed for a reason the user can act on."""
