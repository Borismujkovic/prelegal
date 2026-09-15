"""SQLite access.

The database is deliberately disposable: `init_db` drops every table and
recreates it on each boot, per the project's "created from scratch each time the
container is brought up" rule. Nothing here is a durable store yet, so no
migration story exists — when persistence starts to matter, that is the thing to
add first.

Connections are per-call rather than pooled. At this size that costs nothing and
avoids the thread-affinity rules that make a shared sqlite3 connection awkward
under FastAPI's threadpool.
"""

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from prelegal.config import settings

SCHEMA = """
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE,
    display_name  TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
"""


@contextmanager
def connect(database_path: Path | None = None) -> Iterator[sqlite3.Connection]:
    """A connection that commits on success and rolls back on failure."""
    path = database_path or settings.database_path
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    # Enforce the foreign keys that later tables will rely on; SQLite is off by
    # default and silently ignores them otherwise.
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
