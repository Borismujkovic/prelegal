"""Signing up, signing in, and signing out.

Replaces `routers/session.py`, which took an email and trusted it. There is now
a password, and a session that the server can actually end.

Three details here are security decisions rather than style:

* An unknown email and a wrong password produce the same status, the same
  message, and the same amount of work — `prelegal.auth.DUMMY_PASSWORD_HASH`
  exists so the unknown-email path still pays for one scrypt derivation. Without
  that, response time alone says whether an address has an account.
* Registering *does* report that an email is already taken. That is a real
  disclosure and a deliberate one: the alternative is to accept the signup and
  say nothing, which needs an email round trip to be usable, and there is no
  mail in this system to send it with.
* Signing out does not require being signed in. A cookie the server no longer
  recognises is exactly the case where a user most wants the browser to let go
  of it, and answering 401 would leave it sitting there.
"""

import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from prelegal import auth, db
from prelegal.models import LoginRequest, RegisterRequest, User

router = APIRouter(prefix="/api", tags=["auth"])

#: Said for both an unknown email and a wrong password, deliberately.
_REJECTED = "That email address and password do not match an account."


def _display_name_for(email: str, given: str | None) -> str:
    """Fall back to the local part of the email, title-cased."""
    if given and given.strip():
        return given.strip()
    local_part = email.split("@", 1)[0]
    return local_part.replace(".", " ").replace("_", " ").title()


@router.post("/auth/register", response_model=User, status_code=201)
def register(request: RegisterRequest, response: Response) -> User:
    """Create an account and sign straight in to it."""
    email = request.email.strip().lower()
    display_name = _display_name_for(email, request.display_name)
    password_hash = auth.hash_password(request.password)

    with db.connect() as connection:
        try:
            row = connection.execute(
                """
                INSERT INTO users (email, display_name, password_hash)
                VALUES (?, ?, ?)
                RETURNING id, email, display_name, created_at
                """,
                (email, display_name, password_hash),
            ).fetchone()
        except sqlite3.IntegrityError as exc:
            raise HTTPException(
                status_code=409,
                detail="That email address already has an account. Sign in instead.",
            ) from exc

    user = User(**dict(row))
    auth.set_session_cookie(response, auth.start_session(user.id))
    return user


@router.post("/auth/login", response_model=User)
def login(request: LoginRequest, response: Response) -> User:
    """Check a password and start a session."""
    email = request.email.strip().lower()

    with db.connect() as connection:
        row = connection.execute(
            """
            SELECT id, email, display_name, created_at, password_hash
            FROM users WHERE email = ?
            """,
            (email,),
        ).fetchone()

    # Hash against a decoy when there is no such user, so both failures take the
    # same time. Written as two statements rather than one short-circuiting
    # condition precisely so the verification is never skipped.
    stored = row["password_hash"] if row is not None else auth.DUMMY_PASSWORD_HASH
    password_matches = auth.verify_password(request.password, stored)

    if row is None or not password_matches:
        raise HTTPException(status_code=401, detail=_REJECTED)

    user = User(
        id=row["id"],
        email=row["email"],
        display_name=row["display_name"],
        created_at=row["created_at"],
    )
    # A brand-new token every time, never one the client supplied, so a cookie
    # planted in someone's browser beforehand cannot become an authenticated one.
    auth.set_session_cookie(response, auth.start_session(user.id))
    return user


@router.post("/auth/logout", status_code=204, response_class=Response)
def logout(request: Request) -> Response:
    """End this session and drop the cookie. Succeeds even if neither existed.

    Only this token is forgotten, not every session the user has. Signing out on
    a shared machine should not sign them out on their phone.
    """
    if token := request.cookies.get(auth.COOKIE_NAME):
        auth.end_session(token)

    response = Response(status_code=204)
    auth.clear_session_cookie(response)
    return response


@router.get("/auth/me", response_model=User)
def me(user: Annotated[User, Depends(auth.get_current_user)]) -> User:
    """Who the cookie says you are. 401 and a cleared cookie if it says nobody.

    The frontend is a static export with no server in the request path, so this
    is how it learns whether anyone is signed in on boot.
    """
    return user
