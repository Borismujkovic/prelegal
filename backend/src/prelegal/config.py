"""Where everything lives, and how to override it.

Defaults assume the repository layout (backend/src/prelegal/config.py, so the
repository root is three parents up). The Docker image overrides all three via
environment variables, because there the frontend build output and the catalog
are copied to fixed paths rather than sitting in a checkout.
"""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PRELEGAL_")

    #: SQLite file. Dropped and recreated on every boot — see db.init_db.
    database_path: Path = REPO_ROOT / "data" / "prelegal.db"

    #: The document catalog, the single source of truth for what can be drafted.
    catalog_path: Path = REPO_ROOT / "catalog.json"

    #: The statically exported Next.js frontend. Absent during backend-only test
    #: runs, which is why main.py mounts it conditionally.
    static_dir: Path = REPO_ROOT / "frontend" / "out"


settings = Settings()
