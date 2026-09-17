"""Saved drafts: what a user has written and can come back to.

Everything a user drafts used to live in React state and die on reload. This is
where it goes instead — still only for as long as the container lives, since the
database is recreated on every boot and PL-7 keeps it that way.

Called drafts rather than documents on purpose. `/api/documents/{document_id}/chat`
already exists and its `document_id` is a *type* — `pilot-agreement` — while a
saved draft is one user's copy of one, identified by a number. Putting both
under `/api/documents` would have left the prefix meaning two different things,
told apart only by whether the segment happened to be digits.

The chat endpoints are untouched and remain stateless and unauthenticated:
saving is something the browser chooses to do with values it already holds, not
something a drafting turn does behind the user's back.

Ownership is part of every query rather than a check performed after one. There
is no code path here that reads a row first and decides afterwards whether the
caller was allowed to — `user_id = ?` is in the WHERE clause, so a row belonging
to someone else is simply not selected. Acting on another user's draft therefore
answers 404 and not 403: 403 would confirm that the id exists, which is all
anyone needs to count how many drafts other people have.
"""

import json
import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response

from prelegal import auth, db
from prelegal.catalog import load_catalog
from prelegal.models import Draft, DraftCreate, DraftSummary, DraftUpdate, User

router = APIRouter(prefix="/api", tags=["drafts"])

CurrentUser = Annotated[User, Depends(auth.get_current_user)]

#: Said for a draft that never existed and for one belonging to someone else.
_NOT_FOUND = "No saved draft with that id."

_DRAFT_COLUMNS = "id, document_id, title, values_json, created_at, updated_at"


def _draftable_document_ids() -> set[str]:
    """The documents a draft may claim to be, from the catalog.

    Asked of the catalog rather than kept as a list here, so flipping a document
    to `available` makes it savable at the same moment it becomes draftable.
    """
    return {entry.id for entry in load_catalog().documents if entry.available}


def _to_draft(row: sqlite3.Row) -> Draft:
    return Draft(
        id=row["id"],
        document_id=row["document_id"],
        title=row["title"],
        values=json.loads(row["values_json"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.post("/drafts", response_model=Draft, status_code=201)
def create_draft(request: DraftCreate, user: CurrentUser) -> Draft:
    """Save a draft for the first time."""
    if request.document_id not in _draftable_document_ids():
        raise HTTPException(
            status_code=422,
            detail=f"'{request.document_id}' is not a document Prelegal can draft.",
        )

    with db.connect() as connection:
        row = connection.execute(
            f"""
            INSERT INTO drafts (user_id, document_id, title, values_json)
            VALUES (?, ?, ?, ?)
            RETURNING {_DRAFT_COLUMNS}
            """,  # noqa: S608 — _DRAFT_COLUMNS is a constant, not user input.
            (user.id, request.document_id, request.title, json.dumps(request.values)),
        ).fetchone()

    return _to_draft(row)


@router.get("/drafts", response_model=list[DraftSummary])
def list_drafts(user: CurrentUser) -> list[DraftSummary]:
    """This user's saved drafts, most recently worked on first.

    `id DESC` is not decoration: `datetime('now')` resolves to the second, so
    two drafts saved in the same second would otherwise come back in whatever
    order SQLite felt like, and the list would reshuffle between reloads.
    """
    with db.connect() as connection:
        rows = connection.execute(
            """
            SELECT id, document_id, title, created_at, updated_at
            FROM drafts
            WHERE user_id = ?
            ORDER BY updated_at DESC, id DESC
            """,
            (user.id,),
        ).fetchall()

    return [DraftSummary(**dict(row)) for row in rows]


@router.get("/drafts/{draft_id}", response_model=Draft)
def get_draft(draft_id: int, user: CurrentUser) -> Draft:
    """One draft, with the values needed to carry on where it left off."""
    with db.connect() as connection:
        row = connection.execute(
            f"SELECT {_DRAFT_COLUMNS} FROM drafts WHERE id = ? AND user_id = ?",  # noqa: S608
            (draft_id, user.id),
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return _to_draft(row)


@router.put("/drafts/{draft_id}", response_model=Draft)
def update_draft(draft_id: int, request: DraftUpdate, user: CurrentUser) -> Draft:
    """Save over a draft. `document_id` and `created_at` are left alone."""
    with db.connect() as connection:
        row = connection.execute(
            f"""
            UPDATE drafts
            SET title = ?, values_json = ?, updated_at = datetime('now')
            WHERE id = ? AND user_id = ?
            RETURNING {_DRAFT_COLUMNS}
            """,  # noqa: S608
            (request.title, json.dumps(request.values), draft_id, user.id),
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return _to_draft(row)


@router.delete("/drafts/{draft_id}", status_code=204, response_class=Response)
def delete_draft(draft_id: int, user: CurrentUser) -> Response:
    """Throw a draft away."""
    with db.connect() as connection:
        deleted = connection.execute(
            "DELETE FROM drafts WHERE id = ? AND user_id = ?", (draft_id, user.id)
        ).rowcount

    if deleted == 0:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return Response(status_code=204)
