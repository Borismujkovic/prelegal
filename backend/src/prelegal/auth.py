"""Accounts, passwords, and the session cookie.

Replaces the fake sign-in this project shipped through PL-6, where any email
address got you in and nothing was verified. Passwords are hashed, sessions are
opaque server-side tokens, and the cookie carrying one is not readable by
JavaScript.

Everything here is standard library. bcrypt and PyJWT are the reflex answers,
and both would have been new dependencies — one of them a native wheel in the
image build — to do what `hashlib.scrypt` and `secrets` already do. The one
thing a token library would have bought is statelessness, and that is the wrong
trade here: a row in `sessions` is what makes signing out actually end the
session rather than merely asking the browser to forget it.

The database is still wiped on every boot, so accounts and sessions last as long
as the container does. A cookie that outlives a restart simply stops resolving
and reads as signed out, which is the same path a forged token takes.
"""

import hashlib
import hmac
import secrets

from fastapi import HTTPException, Request, Response

from prelegal import db
from prelegal.config import settings
from prelegal.models import User

COOKIE_NAME = "prelegal_session"

#: Two weeks. The database rarely survives that long, so this is an upper bound
#: rather than the thing that usually ends a session.
COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 14

_SCHEME = "scrypt"
_SALT_BYTES = 16
_DKLEN = 64

#: RFC 7914's own parameters for an interactive login: 128 * N * r = 16 MiB and
#: roughly 45ms per hash in this project's runtime image.
#:
#: Two notes for anyone tempted to raise N. First, `hashlib.scrypt` refuses
#: anything over 32 MiB with "memory limit exceeded" unless `maxmem` is passed
#: explicitly, so N=2**15 and above need that argument as well as this constant.
#: Second, this is below OWASP's suggested N=2**17, and deliberately: that is
#: 128 MiB held per concurrent login in a single small container, which turns
#: the login endpoint into the easiest way to exhaust its memory. Raising it is
#: reasonable behind a real deployment with a request limiter in front; the
#: stored hash records the parameters it was made with, so old passwords keep
#: verifying when it changes.
_N = 1 << 14
_R = 8
_P = 1


def _derive(password: str, salt: bytes, n: int, r: int, p: int, dklen: int) -> bytes:
    return hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=n, r=r, p=p, dklen=dklen
    )


def hash_password(password: str) -> str:
    """Hash a password for storage.

    The result names the scheme and cost it was made with, so the constants
    above can move later without invalidating every password already stored.
    """
    salt = secrets.token_bytes(_SALT_BYTES)
    derived = _derive(password, salt, _N, _R, _P, _DKLEN)
    return f"{_SCHEME}${_N}${_R}${_P}${salt.hex()}${derived.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    """Check a password against a stored hash. Never raises.

    Re-derives with the parameters recorded in `encoded` rather than the current
    constants, and compares in constant time so the number of matching leading
    bytes cannot be measured.
    """
    try:
        scheme, n, r, p, salt_hex, expected_hex = encoded.split("$")
        if scheme != _SCHEME:
            return False
        expected = bytes.fromhex(expected_hex)
        candidate = _derive(
            password, bytes.fromhex(salt_hex), int(n), int(r), int(p), len(expected)
        )
    except ValueError:
        # Malformed, truncated, or hashed by something that is not us.
        return False
    return hmac.compare_digest(candidate, expected)


#: A real hash of a value nobody knows, so that signing in with an email that
#: does not exist still pays the cost of one scrypt derivation. Without it the
#: endpoint answers unknown emails measurably faster than wrong passwords, which
#: is enough to enumerate who has an account here.
DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(32))


def new_session_token() -> str:
    """A fresh, unguessable session token.

    Minted on every sign-in and never derived from anything the client sent, so
    a token planted in someone's browser beforehand cannot be promoted to an
    authenticated one.
    """
    return secrets.token_urlsafe(32)


def start_session(user_id: int) -> str:
    """Record a new session for a user and return its token."""
    token = new_session_token()
    with db.connect() as connection:
        connection.execute(
            "INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, user_id)
        )
    return token


def end_session(token: str) -> None:
    """Forget one session. Silent if it was already gone."""
    with db.connect() as connection:
        connection.execute("DELETE FROM sessions WHERE token = ?", (token,))


def set_session_cookie(response: Response, token: str) -> None:
    """Attach the session cookie.

    HttpOnly so no script can read it, SameSite=Lax so it is not sent with
    cross-site form posts. `secure` is off by default because the app is served
    over plain http://localhost — see `settings.session_cookie_secure`.
    """
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=COOKIE_MAX_AGE_SECONDS,
        httponly=True,
        samesite="lax",
        secure=settings.session_cookie_secure,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


def _clearing_headers() -> dict[str, str]:
    """The `Set-Cookie` that removes a session cookie, as plain headers.

    A `Response` injected into a dependency does not survive an exception being
    raised — FastAPI builds a fresh response for the error — so a 401 can only
    clear the cookie by carrying the header on the exception itself. Built by
    asking a throwaway `Response` rather than hand-writing the header, so it
    stays in step with `clear_session_cookie`.
    """
    response = Response()
    clear_session_cookie(response)
    return dict(response.headers)


def _unauthenticated(detail: str) -> HTTPException:
    return HTTPException(status_code=401, detail=detail, headers=_clearing_headers())


def get_current_user(request: Request) -> User:
    """The signed-in user, or a 401 that also clears the stale cookie.

    Looked up on every call rather than cached: signing out has to take effect
    immediately, and a cached answer would outlive the session it describes.

    A token that was valid before the last restart is indistinguishable from one
    that was never valid, because the row it named is gone either way. Both end
    up here, and both read as signed out.
    """
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise _unauthenticated("You are not signed in.")

    with db.connect() as connection:
        row = connection.execute(
            """
            SELECT users.id, users.email, users.display_name, users.created_at
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token = ?
            """,
            (token,),
        ).fetchone()

    if row is None:
        raise _unauthenticated("Your session has ended. Please sign in again.")

    return User(**dict(row))
