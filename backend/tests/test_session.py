"""The fake login.

These tests pin the two behaviours the frontend depends on: signing in always
succeeds, and signing in twice with the same email returns the same user rather
than creating a second one or erroring.
"""

from fastapi.testclient import TestClient


def test_sign_in_creates_a_user(client: TestClient) -> None:
    response = client.post("/api/session", json={"email": "ada@example.com"})

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "ada@example.com"
    assert body["id"] > 0
    assert body["created_at"]


def test_sign_in_twice_returns_the_same_user(client: TestClient) -> None:
    first = client.post("/api/session", json={"email": "ada@example.com"}).json()
    second = client.post("/api/session", json={"email": "ada@example.com"}).json()

    assert first["id"] == second["id"]


def test_email_is_matched_case_insensitively(client: TestClient) -> None:
    first = client.post("/api/session", json={"email": "ada@example.com"}).json()
    second = client.post("/api/session", json={"email": "ADA@Example.com"}).json()

    assert first["id"] == second["id"]


def test_the_first_display_name_wins(client: TestClient) -> None:
    """A second sign-in must not silently rename the user."""
    client.post(
        "/api/session", json={"email": "ada@example.com", "display_name": "Ada Lovelace"}
    )
    second = client.post(
        "/api/session", json={"email": "ada@example.com", "display_name": "Someone Else"}
    ).json()

    assert second["display_name"] == "Ada Lovelace"


def test_display_name_defaults_to_the_email_local_part(client: TestClient) -> None:
    body = client.post("/api/session", json={"email": "ada.lovelace@example.com"}).json()

    assert body["display_name"] == "Ada Lovelace"


def test_a_blank_display_name_falls_back(client: TestClient) -> None:
    body = client.post(
        "/api/session", json={"email": "ada@example.com", "display_name": "   "}
    ).json()

    assert body["display_name"] == "Ada"


def test_separate_emails_are_separate_users(client: TestClient) -> None:
    ada = client.post("/api/session", json={"email": "ada@example.com"}).json()
    grace = client.post("/api/session", json={"email": "grace@example.com"}).json()

    assert ada["id"] != grace["id"]


def test_a_malformed_email_is_rejected(client: TestClient) -> None:
    response = client.post("/api/session", json={"email": "not-an-email"})

    assert response.status_code == 422


def test_email_is_required(client: TestClient) -> None:
    response = client.post("/api/session", json={})

    assert response.status_code == 422
