"""The fake login.

There is no authentication here and none is implied. Anyone may sign in as any
email address; no password is asked for, no token is issued, and nothing is
verified. PL-4 asks only for a way into the platform, and this is it.

What it does do is exercise the whole stack — browser to FastAPI to SQLite and
back — so the foundation is proven rather than assumed. When real auth arrives it
replaces this module wholesale.
"""

import sqlite3

from fastapi import APIRouter

from prelegal import db
from prelegal.models import SignInRequest, User

router = APIRouter(prefix="/api", tags=["session"])


def _display_name_for(request: SignInRequest) -> str:
    """Fall back to the local part of the email, title-cased."""
    if request.display_name and request.display_name.strip():
        return request.display_name.strip()
    local_part = request.email.split("@", 1)[0]
    return local_part.replace(".", " ").replace("_", " ").title()


@router.post("/session", response_model=User, status_code=200)
def sign_in(request: SignInRequest) -> User:
    """Find the user by email, or create them. Never fails on a duplicate."""
    email = request.email.strip().lower()
    display_name = _display_name_for(request)

    with db.connect() as connection:
        try:
            cursor = connection.execute(
                "INSERT INTO users (email, display_name) VALUES (?, ?) RETURNING *",
                (email, display_name),
            )
            row = cursor.fetchone()
        except sqlite3.IntegrityError:
            # Already signed in once before — return the existing row rather than
            # overwriting the name they first gave.
            row = connection.execute(
                "SELECT * FROM users WHERE email = ?", (email,)
            ).fetchone()

    return User(**dict(row))
