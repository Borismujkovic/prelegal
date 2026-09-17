"""Saved drafts.

Two things are worth more than the rest of this file. One is that a draft is
only ever visible to the person who saved it, and that acting on someone else's
answers 404 rather than 403 — a 403 confirms the id exists, which is enough to
count other people's drafts. The other is that `values` really is opaque: the
Mutual NDA's tagged unions go in and come back unchanged, without this store
knowing anything about them.
"""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from prelegal import auth, db

PASSWORD = "correct-horse-battery"

#: A realistic generic-engine payload.
PILOT_VALUES = {
    "fields": {"effectiveDate": "2026-10-01", "pilotPeriod": "90 days"},
    "party1": {
        "name": "Ada Adams",
        "title": "CEO",
        "company": "Acme",
        "noticeAddress": "legal@acme.example",
    },
    "party2": {
        "name": "Bo Brown",
        "title": "Counsel",
        "company": "Globex",
        "noticeAddress": "legal@globex.example",
    },
}

#: The Mutual NDA's shape, which shares nothing with the one above but the
#: parties. Both have to survive a round trip through the same column.
NDA_VALUES = {
    "purpose": "Evaluating a partnership",
    "effectiveDate": "2026-09-17",
    "ndaTerm": {"kind": "fixed", "years": 3},
    "confidentialityTerm": {"kind": "perpetual"},
    "governingLaw": "Delaware",
    "jurisdiction": "Delaware",
    "modifications": "",
    "party1": {"name": "Ada", "title": "", "company": "Acme", "noticeAddress": ""},
    "party2": {"name": "Bo", "title": "", "company": "Globex", "noticeAddress": ""},
}


def register(client: TestClient, email: str) -> str:
    """Create an account and return its session token."""
    response = client.post(
        "/api/auth/register", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 201
    return response.cookies[auth.COOKIE_NAME]


def sign_in_as(client: TestClient, token: str) -> None:
    client.cookies.clear()
    client.cookies.set(auth.COOKIE_NAME, token)


def save(client: TestClient, **overrides: object) -> dict:
    body = {
        "document_id": "pilot-agreement",
        "title": "Acme × Globex pilot",
        "values": PILOT_VALUES,
    } | overrides
    response = client.post("/api/drafts", json=body)
    assert response.status_code == 201, response.text
    return response.json()


# --------------------------------------------------------------------------- #
# Nothing here is reachable signed out
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "/api/drafts"),
        ("get", "/api/drafts"),
        ("get", "/api/drafts/1"),
        ("put", "/api/drafts/1"),
        ("delete", "/api/drafts/1"),
    ],
)
def test_every_route_needs_a_session(
    client: TestClient, method: str, path: str
) -> None:
    response = client.request(method.upper(), path, json={"title": "x", "values": {}})

    assert response.status_code == 401


# --------------------------------------------------------------------------- #
# Saving
# --------------------------------------------------------------------------- #


def test_saving_a_draft_returns_it(client: TestClient) -> None:
    register(client, "ada@example.com")

    draft = save(client)

    assert draft["id"] > 0
    assert draft["document_id"] == "pilot-agreement"
    assert draft["title"] == "Acme × Globex pilot"
    assert draft["created_at"] == draft["updated_at"]


def test_the_values_come_back_exactly_as_they_went_in(client: TestClient) -> None:
    register(client, "ada@example.com")

    draft = save(client)

    assert draft["values"] == PILOT_VALUES


def test_a_completely_different_value_shape_survives_too(client: TestClient) -> None:
    """The Mutual NDA's tagged unions are the reason this column is opaque.

    Nothing server-side interprets them, so `{"kind": "fixed", "years": 3}` has
    to arrive back intact rather than flattened or dropped.
    """
    register(client, "ada@example.com")

    draft = save(client, document_id="mutual-nda", values=NDA_VALUES)

    assert draft["values"] == NDA_VALUES
    assert draft["values"]["ndaTerm"] == {"kind": "fixed", "years": 3}


def test_a_title_is_trimmed(client: TestClient) -> None:
    register(client, "ada@example.com")

    assert save(client, title="  Pilot  ")["title"] == "Pilot"


def test_a_blank_title_is_refused(client: TestClient) -> None:
    """`min_length` alone would let a single space through, and a draft with no
    visible name cannot be picked out of a list."""
    register(client, "ada@example.com")

    response = client.post(
        "/api/drafts",
        json={"document_id": "pilot-agreement", "title": "   ", "values": {}},
    )

    assert response.status_code == 422


def test_a_document_that_does_not_exist_is_refused(client: TestClient) -> None:
    register(client, "ada@example.com")

    response = client.post(
        "/api/drafts",
        json={"document_id": "employment-contract", "title": "Nope", "values": {}},
    )

    assert response.status_code == 422


def test_a_document_that_cannot_be_drafted_yet_is_refused(client: TestClient) -> None:
    """In the catalog, but `available: false`. Saving one would create a draft
    of something there is no way to open."""
    register(client, "ada@example.com")

    response = client.post(
        "/api/drafts",
        json={"document_id": "cloud-service-agreement", "title": "CSA", "values": {}},
    )

    assert response.status_code == 422


def test_values_that_are_too_large_are_refused(client: TestClient) -> None:
    register(client, "ada@example.com")

    response = client.post(
        "/api/drafts",
        json={
            "document_id": "pilot-agreement",
            "title": "Huge",
            "values": {"blob": "x" * 600_000},
        },
    )

    assert response.status_code == 422
    assert client.get("/api/drafts").json() == []


# --------------------------------------------------------------------------- #
# Listing
# --------------------------------------------------------------------------- #


def test_the_list_starts_empty(client: TestClient) -> None:
    register(client, "ada@example.com")

    assert client.get("/api/drafts").json() == []


def test_the_list_leaves_the_values_out(client: TestClient) -> None:
    """The list is for scanning. Twenty drafts should not mean twenty full
    documents on the wire to render twenty titles."""
    register(client, "ada@example.com")
    save(client)

    assert "values" not in client.get("/api/drafts").json()[0]


def test_the_list_shows_only_your_own_drafts(client: TestClient) -> None:
    ada = register(client, "ada@example.com")
    grace = register(client, "grace@example.com")

    sign_in_as(client, ada)
    save(client, title="Ada's pilot")
    sign_in_as(client, grace)
    save(client, title="Grace's pilot")

    assert [row["title"] for row in client.get("/api/drafts").json()] == [
        "Grace's pilot"
    ]
    sign_in_as(client, ada)
    assert [row["title"] for row in client.get("/api/drafts").json()] == ["Ada's pilot"]


def test_the_list_is_ordered_by_when_it_was_last_worked_on(
    client: TestClient, database_path: Path
) -> None:
    register(client, "ada@example.com")
    older = save(client, title="Older")
    newer = save(client, title="Newer")

    # Set the timestamps directly. `datetime('now')` resolves to the second, so
    # two saves in the same test would otherwise tie and prove nothing.
    with db.connect(database_path) as connection:
        connection.execute(
            "UPDATE drafts SET updated_at = ? WHERE id = ?",
            ("2026-01-01 00:00:00", newer["id"]),
        )
        connection.execute(
            "UPDATE drafts SET updated_at = ? WHERE id = ?",
            ("2026-06-01 00:00:00", older["id"]),
        )

    assert [row["title"] for row in client.get("/api/drafts").json()] == [
        "Older",
        "Newer",
    ]


def test_drafts_saved_in_the_same_second_keep_a_stable_order(
    client: TestClient, database_path: Path
) -> None:
    """Otherwise the list reshuffles between reloads for no visible reason."""
    register(client, "ada@example.com")
    first = save(client, title="First")
    second = save(client, title="Second")

    with db.connect(database_path) as connection:
        connection.execute("UPDATE drafts SET updated_at = '2026-01-01 00:00:00'")

    titles = [row["title"] for row in client.get("/api/drafts").json()]

    assert titles == ["Second", "First"]
    assert second["id"] > first["id"]


# --------------------------------------------------------------------------- #
# Reading one
# --------------------------------------------------------------------------- #


def test_a_draft_can_be_read_back_in_full(client: TestClient) -> None:
    register(client, "ada@example.com")
    saved = save(client)

    assert client.get(f"/api/drafts/{saved['id']}").json() == saved


def test_a_draft_that_does_not_exist_is_not_found(client: TestClient) -> None:
    register(client, "ada@example.com")

    assert client.get("/api/drafts/999").status_code == 404


def test_somebody_elses_draft_is_indistinguishable_from_one_that_never_existed(
    client: TestClient,
) -> None:
    """404 and not 403, in the same words — otherwise the response counts other
    people's drafts for you."""
    ada = register(client, "ada@example.com")
    grace = register(client, "grace@example.com")

    sign_in_as(client, ada)
    saved = save(client)

    sign_in_as(client, grace)
    theirs = client.get(f"/api/drafts/{saved['id']}")
    imaginary = client.get("/api/drafts/999")

    assert theirs.status_code == imaginary.status_code == 404
    assert theirs.json()["detail"] == imaginary.json()["detail"]


def test_an_id_that_is_not_a_number_is_rejected(client: TestClient) -> None:
    register(client, "ada@example.com")

    assert client.get("/api/drafts/pilot-agreement").status_code == 422


# --------------------------------------------------------------------------- #
# Saving over one
# --------------------------------------------------------------------------- #


def test_saving_over_a_draft_replaces_its_title_and_values(client: TestClient) -> None:
    register(client, "ada@example.com")
    saved = save(client)

    updated = client.put(
        f"/api/drafts/{saved['id']}",
        json={"title": "Renamed", "values": {"fields": {"pilotPeriod": "30 days"}}},
    ).json()

    assert updated["title"] == "Renamed"
    assert updated["values"] == {"fields": {"pilotPeriod": "30 days"}}


def test_saving_over_a_draft_does_not_change_what_document_it_is(
    client: TestClient,
) -> None:
    register(client, "ada@example.com")
    saved = save(client)

    updated = client.put(
        f"/api/drafts/{saved['id']}", json={"title": "Renamed", "values": {}}
    ).json()

    assert updated["document_id"] == "pilot-agreement"
    assert updated["created_at"] == saved["created_at"]


def test_saving_over_somebody_elses_draft_is_not_found_and_changes_nothing(
    client: TestClient,
) -> None:
    ada = register(client, "ada@example.com")
    grace = register(client, "grace@example.com")

    sign_in_as(client, ada)
    saved = save(client)

    sign_in_as(client, grace)
    response = client.put(
        f"/api/drafts/{saved['id']}", json={"title": "Stolen", "values": {}}
    )

    assert response.status_code == 404
    sign_in_as(client, ada)
    assert client.get(f"/api/drafts/{saved['id']}").json() == saved


def test_an_oversized_update_leaves_the_draft_alone(client: TestClient) -> None:
    register(client, "ada@example.com")
    saved = save(client)

    response = client.put(
        f"/api/drafts/{saved['id']}",
        json={"title": "Huge", "values": {"blob": "x" * 600_000}},
    )

    assert response.status_code == 422
    assert client.get(f"/api/drafts/{saved['id']}").json() == saved


# --------------------------------------------------------------------------- #
# Throwing one away
# --------------------------------------------------------------------------- #


def test_a_draft_can_be_deleted(client: TestClient) -> None:
    register(client, "ada@example.com")
    saved = save(client)

    assert client.delete(f"/api/drafts/{saved['id']}").status_code == 204
    assert client.get(f"/api/drafts/{saved['id']}").status_code == 404


def test_deleting_a_draft_that_does_not_exist_is_not_found(client: TestClient) -> None:
    register(client, "ada@example.com")

    assert client.delete("/api/drafts/999").status_code == 404


def test_deleting_somebody_elses_draft_does_not_delete_it(client: TestClient) -> None:
    ada = register(client, "ada@example.com")
    grace = register(client, "grace@example.com")

    sign_in_as(client, ada)
    saved = save(client)

    sign_in_as(client, grace)
    assert client.delete(f"/api/drafts/{saved['id']}").status_code == 404

    sign_in_as(client, ada)
    assert client.get(f"/api/drafts/{saved['id']}").status_code == 200
