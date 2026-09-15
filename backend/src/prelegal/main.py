"""The FastAPI application.

It serves two things: the JSON API under /api, and the statically exported
Next.js frontend at everything else. One process, one port, one container.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

from prelegal import db
from prelegal.config import settings
from prelegal.routers import catalog, health, session


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # The database is recreated on every boot; see db.init_db.
    db.init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Prelegal",
        description="Draft legal agreements from Common Paper templates.",
        version="0.1.0",
        lifespan=lifespan,
    )

    # Registered before the catch-all below, so API routes always win.
    app.include_router(health.router)
    app.include_router(session.router)
    app.include_router(catalog.router)

    _mount_frontend(app)
    return app


def _resolve_static_file(url_path: str) -> Path | None:
    """Map a URL path onto a file in the export, or None if there isn't one.

    A Next.js static export emits `/login` as `login.html`, so a plain static
    mount would 404 on every route but `/`. This reproduces nginx's `try_files
    $uri $uri.html $uri/index.html`, which is what the Next.js deployment docs
    prescribe for `trailingSlash: false`.
    """
    static_dir = settings.static_dir.resolve()
    relative = url_path.strip("/")

    candidates = (
        static_dir / relative if relative else static_dir / "index.html",
        static_dir / f"{relative}.html" if relative else None,
        static_dir / relative / "index.html" if relative else None,
    )

    for candidate in candidates:
        if candidate is None:
            continue
        resolved = candidate.resolve()
        # Refuse anything that escapes the export directory — `..` in the URL,
        # or a symlink pointing outside it.
        if not resolved.is_relative_to(static_dir):
            continue
        if resolved.is_file():
            return resolved

    return None


def _mount_frontend(app: FastAPI) -> None:
    """Serve the built frontend, if it has been built.

    The export is absent during backend-only test runs and on a fresh checkout,
    so its absence is reported per-request rather than crashing at startup.
    """

    @app.get("/{url_path:path}", include_in_schema=False)
    def serve_frontend(url_path: str) -> FileResponse:
        # An unmatched /api/* path is a genuine 404, not a frontend route.
        if url_path == "api" or url_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")

        if not settings.static_dir.is_dir():
            raise HTTPException(
                status_code=503,
                detail=(
                    "Frontend has not been built. Run `npm run build` in frontend/, "
                    "or start the app with the scripts in scripts/."
                ),
            )

        if file_path := _resolve_static_file(url_path):
            return FileResponse(file_path)

        # Next.js exports its own 404 page; use it so the shell stays consistent.
        not_found_page = settings.static_dir / "404.html"
        if not_found_page.is_file():
            return FileResponse(not_found_page, status_code=404)
        raise HTTPException(status_code=404, detail="Not found")


app = create_app()
