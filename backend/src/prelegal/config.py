"""Where everything lives, and how to override it.

Defaults assume the repository layout (backend/src/prelegal/config.py, so the
repository root is three parents up). The Docker image overrides all three via
environment variables, because there the frontend build output and the catalog
are copied to fixed paths rather than sitting in a checkout.
"""

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PRELEGAL_")

    #: SQLite file. Dropped and recreated on every boot — see db.init_db.
    database_path: Path = REPO_ROOT / "data" / "prelegal.db"

    #: The document catalog, the single source of truth for what can be drafted.
    catalog_path: Path = REPO_ROOT / "catalog.json"

    #: The verbatim Common Paper Standard Terms. Read to check that every cover
    #: page overlay still describes exactly the fields its agreement substitutes.
    templates_dir: Path = REPO_ROOT / "templates"

    #: Prelegal's cover page overlays: the labels, hints and field types that
    #: Common Paper never published for these agreements. The frontend build
    #: reads the same files, so the wording is authored once.
    cover_pages_dir: Path = REPO_ROOT / "cover-pages"

    #: The statically exported Next.js frontend. Absent during backend-only test
    #: runs, which is why main.py mounts it conditionally.
    static_dir: Path = REPO_ROOT / "frontend" / "out"

    #: Whether the session cookie is marked `Secure`.
    #:
    #: Off by default because nothing in scripts/ or the Dockerfile terminates
    #: TLS — the app is served over plain http, and a `Secure` cookie on an http
    #: origin is silently dropped by the browser, which would present as "login
    #: succeeds but you are immediately signed out again". Set
    #: PRELEGAL_SESSION_COOKIE_SECURE=true when there is real TLS in front.
    session_cookie_secure: bool = False

    #: Authenticates the Mutual NDA chat against OpenRouter.
    #:
    #: Aliased past the PRELEGAL_ prefix on purpose: .env, .env.example and
    #: docker-compose.yml all name it bare, and so does LiteLLM, which reads the
    #: environment itself when it authenticates. Holding it here as well is what
    #: lets the chat refuse a turn before making a doomed network call, and what
    #: tests monkeypatch to exercise that path.
    openrouter_api_key: str | None = Field(
        default=None, validation_alias="OPENROUTER_API_KEY"
    )


settings = Settings()
