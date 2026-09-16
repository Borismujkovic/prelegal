"""Shared fixtures.

Every test gets its own SQLite file in a tmp directory, so the suite never
touches the real database and tests cannot leak users into each other.
"""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from prelegal import dynamic_models, triage
from prelegal.catalog import load_catalog
from prelegal.config import settings
from prelegal.document_specs import load_document_specs
from prelegal.main import create_app

REPO_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def database_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "test.db"
    monkeypatch.setattr(settings, "database_path", path)
    return path


def _clear_caches() -> None:
    """Drop everything read once and cached for the life of the process.

    All four are derived from the catalog, in that order, so clearing only the
    first would leave the specs and the two sets of schemas describing a catalog
    that is no longer loaded. The triage schema is the easiest to forget: its
    enum of recommendable document ids is baked in at build time, so a stale one
    silently decides which documents the assistant believes in.
    """
    load_catalog.cache_clear()
    load_document_specs.cache_clear()
    dynamic_models.clear_cache()
    triage.clear_cache()


@pytest.fixture
def client(database_path: Path) -> Iterator[TestClient]:
    """A client whose lifespan has run, so the schema exists."""
    # These are cached across tests; clear them so a monkeypatched path takes.
    _clear_caches()
    with TestClient(create_app()) as test_client:
        yield test_client
    _clear_caches()


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
