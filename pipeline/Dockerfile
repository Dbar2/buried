# The Studio service image (spec 04 task 3.4). Build from the repository root:
#   docker build -f pipeline/Dockerfile .
# Which files enter the build context is set by pipeline/Dockerfile.dockerignore.
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app/pipeline
COPY pipeline/pyproject.toml pipeline/uv.lock ./
COPY pipeline/buried_pipeline ./buried_pipeline
RUN uv sync --extra service --frozen --no-dev

# The canon contract files (the context carries only these; no rasters, no work files).
COPY data /app/data

ENV PATH="/app/pipeline/.venv/bin:${PATH}" \
    BURIED_REPO_ROOT=/app \
    PYTHONUNBUFFERED=1

# Railway sets PORT.
CMD ["sh", "-c", "uvicorn buried_pipeline.service.app:create_app --factory --host 0.0.0.0 --port ${PORT:-8000}"]
