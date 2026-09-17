"""SQLite access.

The database is deliberately disposable: `init_db` drops every table and
recreates it on each boot, per the project's "created from scratch each time the
container is brought up" rule. PL-7 adds accounts and saved drafts on top of
that without changing it — signing up and saving a draft last as long as the
container does and no longer, which is what the ticket asks for. There is still
no migration story; the day one is wanted, this is the file that needs it.

Connections are per-call rather than pooled. At this size that costs nothing and
avoids the thread-affinity rules that make a shared sqlite3 connection awkward
under FastAPI's threadpool.
"""

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from prelegal.config import settings

#: Children are dropped before `users`, which is correct rather than merely
#: tidy — though not for the reason it first appears.
#:
#: `connect` turns foreign keys on before this script runs, and on every boot
#: after the first the tables still hold the previous run's rows: the file
#: outlives the process, and only `init_db` empties it. SQLite performs an
#: implicit `DELETE FROM` before dropping a table, so with the `ON DELETE
#: CASCADE` clauses below, dropping `users` first would in fact succeed today —
#: the delete would cascade. It is the moment someone changes one of those
#: clauses that this ordering earns its keep: without the cascade the same drop
#: raises "FOREIGN KEY constraint failed" inside the lifespan handler, so the
#: app would fail to start on its second boot and only its second, which is
#: about the worst shape a bug can take. Dropping children first is correct
#: under either declaration, so it does not depend on remembering any of this.
SCHEMA = """
DROP TABLE IF EXISTS drafts;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    email          TEXT    NOT NULL UNIQUE,
    display_name   TEXT    NOT NULL,
    password_hash  TEXT    NOT NULL,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
    token       TEXT    PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE drafts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_id  TEXT    NOT NULL,
    title        TEXT    NOT NULL,
    values_json  TEXT    NOT NULL,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_drafts_user_id   ON drafts(user_id);
"""


@contextmanager
def connect(database_path: Path | None = None) -> Iterator[sqlite3.Connection]:
    """A connection that commits on success and rolls back on failure."""
    path = database_path or settings.database_path
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    # Enforce the foreign keys the sessions and drafts tables rely on; SQLite is
    # off by default and silently ignores them otherwise.
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def init_db(database_path: Path | None = None) -> None:
    """Create the schema from scratch, discarding anything already there."""
    path = database_path or settings.database_path
    path.parent.mkdir(parents=True, exist_ok=True)
    with connect(path) as connection:
        connection.executescript(SCHEMA)
