"""Serving the Next.js static export.

A static export emits `/login` as `login.html`, so plain static file serving
404s on every route but `/`. These tests pin the try_files behaviour that fixes
that, and the traversal guard that keeps it from serving the rest of the disk.
"""

from pathlib import Path

from fastapi.testclient import TestClient


def test_root_serves_the_index(client: TestClient, built_frontend: Path) -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert "index" in response.text


def test_a_route_resolves_to_its_sibling_html(client: TestClient, built_frontend: Path) -> None:
    response = client.get("/login")

    assert response.status_code == 200
    assert "login" in response.text


def test_a_nested_route_resolves(client: TestClient, built_frontend: Path) -> None:
    response = client.get("/documents/mutual-nda")

    assert response.status_code == 200
    assert "nda" in response.text


def test_a_hashed_asset_is_served_directly(client: TestClient, built_frontend: Path) -> None:
    response = client.get("/_next/static/app.js")

    assert response.status_code == 200
    assert "console.log" in response.text


def test_an_index_html_in_a_directory_resolves(
    client: TestClient, built_frontend: Path
) -> None:
    """`trailingSlash: true` exports this shape instead; support both."""
    (built_frontend / "settings").mkdir()
    (built_frontend / "settings" / "index.html").write_text("<html>settings</html>")

    response = client.get("/settings")

    assert response.status_code == 200
    assert "settings" in response.text


def test_an_unknown_route_gets_the_exported_404(
    client: TestClient, built_frontend: Path
) -> None:
    response = client.get("/nope")

    assert response.status_code == 404
    assert "not found" in response.text


def test_an_unknown_api_route_is_a_json_404(client: TestClient, built_frontend: Path) -> None:
    """It must not fall through to the frontend and return HTML."""
    response = client.get("/api/does-not-exist")

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")


def test_traversal_out_of_the_export_is_refused(
    client: TestClient, built_frontend: Path
) -> None:
    secret = built_frontend.parent / "secret.txt"
    secret.write_text("do not serve me", encoding="utf-8")

    for attempt in ("/../secret.txt", "/%2e%2e/secret.txt", "/documents/../../secret.txt"):
        response = client.get(attempt)
        assert "do not serve me" not in response.text, attempt


def test_a_missing_build_explains_itself(client: TestClient, no_frontend: Path) -> None:
    response = client.get("/")

    assert response.status_code == 503
    assert "has not been built" in response.json()["detail"]


def test_the_api_still_works_without_a_build(client: TestClient, no_frontend: Path) -> None:
    """A missing frontend must not take the API down with it."""
    assert client.get("/api/catalog").status_code == 200
