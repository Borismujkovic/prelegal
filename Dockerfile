# syntax=docker/dockerfile:1

# ---- Stage 1: build the frontend to static HTML/CSS/JS ----------------------
# `next build` with `output: "export"` produces out/, which stage 2 serves.
#
# Note: next/font/google downloads the font files during this build and
# self-hosts them, so this stage needs network access to fonts.googleapis.com.
# An air-gapped build fails here; vendoring the fonts with next/font/local is
# the fix if that is ever needed.
FROM node:22-alpine AS frontend

WORKDIR /build

# Dependencies first, so a source-only change does not reinstall them.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# The generators read ../../templates, ../../cover-pages and ../../catalog.json
# relative to frontend/scripts, so all three have to be in place before the
# prebuild hook runs.
COPY templates/ /templates/
COPY cover-pages/ /cover-pages/
COPY catalog.json /catalog.json
COPY frontend/ ./
RUN npm run build


# ---- Stage 2: the API, which also serves that build -------------------------
FROM python:3.12-slim AS runtime

# uv, per the project's uv-based backend.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PRELEGAL_DATABASE_PATH=/app/data/prelegal.db \
    PRELEGAL_CATALOG_PATH=/app/catalog.json \
    PRELEGAL_TEMPLATES_DIR=/app/templates \
    PRELEGAL_COVER_PAGES_DIR=/app/cover-pages \
    PRELEGAL_STATIC_DIR=/app/frontend/out

# Dependencies before source, again for layer caching.
COPY backend/pyproject.toml backend/uv.lock* /app/backend/
RUN --mount=type=cache,target=/root/.cache/uv \
    cd /app/backend && uv sync --frozen --no-install-project --no-dev

COPY backend/ /app/backend/
RUN --mount=type=cache,target=/root/.cache/uv \
    cd /app/backend && uv sync --frozen --no-dev

# The catalog, the templates it points at, and the cover pages that say what
# each document asks for. The backend reads all three at runtime.
COPY catalog.json /app/catalog.json
COPY templates/ /app/templates/
COPY cover-pages/ /app/cover-pages/

COPY --from=frontend /build/out /app/frontend/out

# Run as a non-root user; it needs to own /app/data to create the SQLite file.
RUN useradd --create-home --uid 1000 prelegal \
    && mkdir -p /app/data \
    && chown -R prelegal:prelegal /app/data
USER prelegal

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health').status==200 else 1)"

# Call the venv's uvicorn directly. Going through `uv run` would make uv
# re-sync the environment on every boot, which fails once the process drops to
# a non-root user that cannot write the root-owned venv.
CMD ["/app/backend/.venv/bin/uvicorn", "prelegal.main:app", "--host", "0.0.0.0", "--port", "8000"]
