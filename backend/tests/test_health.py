"""Health, and the boot behaviour it reports on."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from prelegal import db
from prelegal.catalog import load_catalog
from prelegal.config import settings
from prelegal.main import create_app


def test_health_reports_database_and_catalog(client: TestClient) -> None:
    body = client.get("/api/health").json()

    assert body == {"status": "ok", "database": "ok", "catalog_documents": 11}


def test_the_schema_is_created_on_boot(client: TestClient, database_path: Path) -> None:
    """The lifespan handler runs init_db, so the users table exists."""
    with db.connect(database_path) as connection:
        tables = {
            row["name"]
            for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }

    assert "users" in tables


def test_the_database_is_recreated_from_scratch_on_every_boot(
    database_path: Path,
) -> None:
    """CLAUDE.md requires a throwaway database. Prove users do not survive a
    restart, so nobody builds on the assumption that they do."""
    with TestClient(create_app()) as first_boot:
        first_boot.post("/api/session", json={"email": "ada@example.com"})
        assert first_boot.get("/api/health").json()["status"] == "ok"

    with TestClient(create_app()) as second_boot:
        # Same email, fresh database: a brand new row with id 1 again.
        user = second_boot.post("/api/session", json={"email": "ada@example.com"}).json()
        assert user["id"] == 1

    with db.connect(database_path) as connection:
        count = connection.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"]
    assert count == 1


def test_health_reports_a_broken_database(
    client: TestClient, database_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "database_path", database_path.parent / "gone" / "x.db")

    response = client.get("/api/health")

    assert response.status_code == 503
    assert "database unavailable" in response.json()["detail"]


def test_health_reports_an_unreadable_catalog(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The symmetric case to a broken database: a catalog that will not load
    must surface as unhealthy rather than as an empty dashboard."""
    load_catalog.cache_clear()
    monkeypatch.setattr(settings, "catalog_path", tmp_path / "missing.json")

    response = client.get("/api/health")

    assert response.status_code == 503
    assert "catalog unreadable" in response.json()["detail"]


def test_health_reports_a_malformed_catalog(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    load_catalog.cache_clear()
    malformed = tmp_path / "catalog.json"
    malformed.write_text('{"version": 1}', encoding="utf-8")  # no documents key
    monkeypatch.setattr(settings, "catalog_path", malformed)

    response = client.get("/api/health")

    assert response.status_code == 503
    assert "catalog unreadable" in response.json()["detail"]
