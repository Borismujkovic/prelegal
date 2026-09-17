"""Real accounts: passwords, sessions, and the cookie that carries one.

Replaces `test_session.py`, which pinned the behaviour of a login that verified
nothing. What is tested here that could not be tested before: that a password is
actually checked, that signing out actually ends the session server-side, and
that failing to sign in says the same thing whether or not the account exists.
"""

import hashlib
import secrets

import pytest
from fastapi.testclient import TestClient

from prelegal import auth

PASSWORD = "correct-horse-battery"
CREDENTIALS = {"email": "ada@example.com", "password": PASSWORD}


def sign_in_as(client: TestClient, token: str) -> None:
    """Make the client carry exactly this session and no other.

    The jar is emptied first on purpose. Adding a second cookie beside the one
    the client already holds would send both, and which one the server read
    would be down to ordering rather than to the test.
    """
    client.cookies.clear()
    client.cookies.set(auth.COOKIE_NAME, token)


# --------------------------------------------------------------------------- #
# Hashing, as a unit
# --------------------------------------------------------------------------- #


def test_a_hash_records_the_scheme_that_made_it() -> None:
    assert auth.hash_password(PASSWORD).startswith("scrypt$")


def test_the_same_password_hashes_differently_every_time() -> None:
    """Salted. Two users who pick one password must not share a hash."""
    assert auth.hash_password(PASSWORD) != auth.hash_password(PASSWORD)


def test_a_password_verifies_against_its_own_hash() -> None:
    assert auth.verify_password(PASSWORD, auth.hash_password(PASSWORD))


def test_the_wrong_password_does_not_verify() -> None:
    assert not auth.verify_password("something else", auth.hash_password(PASSWORD))


@pytest.mark.parametrize(
    "encoded",
    ["", "not-a-hash", "scrypt$boom", "bcrypt$16384$8$1$aa$bb", "scrypt$x$8$1$aa$bb"],
)
def test_an_unreadable_hash_is_a_failed_check_not_a_crash(encoded: str) -> None:
    """A hash written by something else must sign nobody in, and must not take
    anything down while refusing."""
    assert not auth.verify_password(PASSWORD, encoded)


def test_a_hash_made_with_other_cost_parameters_still_verifies() -> None:
    """The stored parameters are used, not today's constants.

    This is the whole point of encoding them in the string: it is what lets the
    cost be raised later without invalidating every password already set.
    """
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(PASSWORD.encode(), salt=salt, n=1024, r=8, p=1, dklen=32)

    assert auth.verify_password(PASSWORD, f"scrypt$1024$8$1${salt.hex()}${derived.hex()}")


def test_the_decoy_hash_is_a_real_one_that_nothing_matches() -> None:
    """It has to cost what a real check costs, or it hides nothing."""
    assert auth.DUMMY_PASSWORD_HASH.startswith("scrypt$")
    assert not auth.verify_password(PASSWORD, auth.DUMMY_PASSWORD_HASH)


# --------------------------------------------------------------------------- #
# Registering
# --------------------------------------------------------------------------- #


def test_registering_creates_an_account(client: TestClient) -> None:
    response = client.post("/api/auth/register", json=CREDENTIALS)

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "ada@example.com"
    assert body["id"] > 0
    assert body["created_at"]


def test_registering_never_echoes_the_password(client: TestClient) -> None:
    response = client.post("/api/auth/register", json=CREDENTIALS)

    assert "password" not in response.text
    assert PASSWORD not in response.text


def test_registering_signs_you_straight_in(client: TestClient) -> None:
    client.post("/api/auth/register", json=CREDENTIALS)

    assert client.get("/api/auth/me").json()["email"] == "ada@example.com"


def test_the_session_cookie_is_not_readable_by_scripts(client: TestClient) -> None:
    """HttpOnly and SameSite are the entire reason this is a cookie rather than
    a token in localStorage. If they go missing, the choice bought nothing."""
    header = client.post("/api/auth/register", json=CREDENTIALS).headers["set-cookie"]

    assert "httponly" in header.lower()
    assert "samesite=lax" in header.lower()
    assert "path=/" in header.lower()


def test_an_email_can_only_be_registered_once(client: TestClient) -> None:
    client.post("/api/auth/register", json=CREDENTIALS)
    response = client.post("/api/auth/register", json=CREDENTIALS)

    assert response.status_code == 409


def test_a_duplicate_is_caught_whatever_the_capitalisation(client: TestClient) -> None:
    client.post("/api/auth/register", json=CREDENTIALS)
    response = client.post(
        "/api/auth/register", json={"email": "ADA@Example.com", "password": PASSWORD}
    )

    assert response.status_code == 409


def test_a_short_password_is_refused(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register", json={"email": "ada@example.com", "password": "short"}
    )

    assert response.status_code == 422


def test_a_malformed_email_is_refused(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register", json={"email": "not-an-email", "password": PASSWORD}
    )

    assert response.status_code == 422


def test_a_password_is_required(client: TestClient) -> None:
    response = client.post("/api/auth/register", json={"email": "ada@example.com"})

    assert response.status_code == 422


def test_display_name_defaults_to_the_email_local_part(client: TestClient) -> None:
    body = client.post(
        "/api/auth/register",
        json={"email": "ada.lovelace@example.com", "password": PASSWORD},
    ).json()

    assert body["display_name"] == "Ada Lovelace"


def test_a_blank_display_name_falls_back(client: TestClient) -> None:
    body = client.post(
        "/api/auth/register", json={**CREDENTIALS, "display_name": "   "}
    ).json()

    assert body["display_name"] == "Ada"


# --------------------------------------------------------------------------- #
# Signing in
# --------------------------------------------------------------------------- #


def test_signing_in_with_the_right_password_works(client: TestClient) -> None:
    client.post("/api/auth/register", json=CREDENTIALS)
    client.post("/api/auth/logout")

    response = client.post("/api/auth/login", json=CREDENTIALS)

    assert response.status_code == 200
    assert response.json()["email"] == "ada@example.com"


def test_the_email_is_matched_case_insensitively(client: TestClient) -> None:
    first = client.post("/api/auth/register", json=CREDENTIALS).json()
    second = client.post(
        "/api/auth/login", json={"email": "ADA@Example.com", "password": PASSWORD}
    ).json()

    assert first["id"] == second["id"]


def test_every_sign_in_mints_a_new_token(client: TestClient) -> None:
    """Session fixation: a token planted beforehand must never be adopted."""
    client.post("/api/auth/register", json=CREDENTIALS)
    first = client.cookies[auth.COOKIE_NAME]
    client.post("/api/auth/login", json=CREDENTIALS)
    second = client.cookies[auth.COOKIE_NAME]

    assert first != second


def test_the_wrong_password_is_refused(client: TestClient) -> None:
    client.post("/api/auth/register", json=CREDENTIALS)

    response = client.post(
        "/api/auth/login",
        json={"email": "ada@example.com", "password": "not it at all"},
    )

    assert response.status_code == 401


def test_an_unknown_email_is_refused_in_exactly_the_same_words(
    client: TestClient,
) -> None:
    """Anything that tells these two apart tells you whether an account exists."""
    client.post("/api/auth/register", json=CREDENTIALS)

    wrong_password = client.post(
        "/api/auth/login",
        json={"email": "ada@example.com", "password": "not it at all"},
    )
    no_such_user = client.post(
        "/api/auth/login", json={"email": "grace@example.com", "password": PASSWORD}
    )

    assert wrong_password.status_code == no_such_user.status_code == 401
    assert wrong_password.json()["detail"] == no_such_user.json()["detail"]


def test_an_unknown_email_still_pays_for_a_password_check(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A deterministic stand-in for the timing test.

    Asserting on elapsed time would be flaky. Asserting that the verification
    happened at all pins the same property, because the cost *is* the
    verification — skip it and the endpoint answers unknown emails faster.
    """
    seen: list[str] = []
    real = auth.verify_password

    def counting(password: str, encoded: str) -> bool:
        seen.append(encoded)
        return real(password, encoded)

    monkeypatch.setattr(auth, "verify_password", counting)

    client.post(
        "/api/auth/login", json={"email": "nobody@example.com", "password": PASSWORD}
    )

    assert seen == [auth.DUMMY_PASSWORD_HASH]


def test_separate_emails_are_separate_accounts(client: TestClient) -> None:
    ada = client.post("/api/auth/register", json=CREDENTIALS).json()
    grace = client.post(
        "/api/auth/register", json={"email": "grace@example.com", "password": PASSWORD}
    ).json()

    assert ada["id"] != grace["id"]


# --------------------------------------------------------------------------- #
# Who am I, and signing out
# --------------------------------------------------------------------------- #


def test_me_without_a_cookie_is_unauthenticated(client: TestClient) -> None:
    assert client.get("/api/auth/me").status_code == 401


def test_an_unrecognised_token_is_unauthenticated(client: TestClient) -> None:
    sign_in_as(client, "a token that was never issued")

    assert client.get("/api/auth/me").status_code == 401


def test_a_rejected_request_tells_the_browser_to_drop_the_cookie(
    client: TestClient,
) -> None:
    """Otherwise a cookie the server will never accept sits in the browser for a
    fortnight, and every request carries it."""
    sign_in_as(client, "a token that was never issued")

    response = client.get("/api/auth/me")

    assert response.status_code == 401
    assert auth.COOKIE_NAME in response.headers.get("set-cookie", "")


def test_signing_out_ends_the_session_on_the_server(client: TestClient) -> None:
    """Not merely in the browser: the token must stop working even for someone
    who kept a copy of it."""
    client.post("/api/auth/register", json=CREDENTIALS)
    token = client.cookies[auth.COOKIE_NAME]

    assert client.post("/api/auth/logout").status_code == 204

    sign_in_as(client, token)
    assert client.get("/api/auth/me").status_code == 401


def test_signing_out_when_never_signed_in_still_succeeds(client: TestClient) -> None:
    """A cookie the server does not recognise is exactly when the browser most
    needs telling to drop it, so this cannot be a 401."""
    assert client.post("/api/auth/logout").status_code == 204


def test_signing_out_leaves_this_users_other_sessions_alone(client: TestClient) -> None:
    """Signing out on a shared machine should not sign you out on your phone."""
    client.post("/api/auth/register", json=CREDENTIALS)
    phone = client.cookies[auth.COOKIE_NAME]
    client.post("/api/auth/login", json=CREDENTIALS)
    laptop = client.cookies[auth.COOKIE_NAME]

    sign_in_as(client, laptop)
    client.post("/api/auth/logout")

    sign_in_as(client, phone)
    assert client.get("/api/auth/me").status_code == 200


def test_two_people_are_told_apart_by_their_cookies(client: TestClient) -> None:
    client.post("/api/auth/register", json=CREDENTIALS)
    ada = client.cookies[auth.COOKIE_NAME]
    client.post(
        "/api/auth/register", json={"email": "grace@example.com", "password": PASSWORD}
    )
    grace = client.cookies[auth.COOKIE_NAME]

    sign_in_as(client, ada)
    assert client.get("/api/auth/me").json()["email"] == "ada@example.com"
    sign_in_as(client, grace)
    assert client.get("/api/auth/me").json()["email"] == "grace@example.com"
