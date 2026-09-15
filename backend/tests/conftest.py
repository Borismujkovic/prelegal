"""Shared fixtures.

Every test gets its own SQLite file in a tmp directory, so the suite never
touches the real database and tests cannot leak users into each other.
"""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from prelegal.catalog import load_catalog
from prelegal.config import settings
from prelegal.main import create_app

REPO_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def database_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "test.db"
    monkeypatch.setattr(settings, "database_path", path)
    return path


@pytest.fixture
def client(database_path: Path) -> Iterator[TestClient]:
    """A client whose lifespan has run, so the schema exists."""
    # The catalog is cached across tests; clear it so a monkeypatched path takes.
    load_catalog.cache_clear()
    with TestClient(create_app()) as test_client:
        yield test_client
    load_catalog.cache_clear()


@pytest.fixture
def no_frontend(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point static_dir at a directory with no build in it."""
    missing = tmp_path / "not-built"
    monkeypatch.setattr(settings, "static_dir", missing)
    return missing


@pytest.fixture
def built_frontend(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A stand-in for `next build`'s output, shaped the way an export is.

    Mirrors the real thing: `/` as index.html, a route as a sibling .html file,
    a nested route, a hashed asset, and the exported 404 page.
    """
    out = tmp_path / "out"
    (out / "documents").mkdir(parents=True)
    (out / "_next" / "static").mkdir(parents=True)

    (out / "index.html").write_text("<html>index</html>", encoding="utf-8")
    (out / "login.html").write_text("<html>login</html>", encoding="utf-8")
    (out / "documents.html").write_text("<html>dashboard</html>", encoding="utf-8")
    (out / "documents" / "mutual-nda.html").write_text("<html>nda</html>", encoding="utf-8")
    (out / "404.html").write_text("<html>not found</html>", encoding="utf-8")
    (out / "_next" / "static" / "app.js").write_text("console.log(1)", encoding="utf-8")

    monkeypatch.setattr(settings, "static_dir", out)
    return out
