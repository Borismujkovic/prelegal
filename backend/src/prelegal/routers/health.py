"""Liveness, with enough detail to tell what is actually broken."""

from fastapi import APIRouter, HTTPException

from prelegal import db
from prelegal.catalog import load_catalog
from prelegal.models import Health

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health", response_model=Health)
def health() -> Health:
    try:
        with db.connect() as connection:
            connection.execute("SELECT COUNT(*) FROM users").fetchone()
    except Exception as exc:  # noqa: BLE001 — the reason is the useful part
        raise HTTPException(status_code=503, detail=f"database unavailable: {exc}") from exc

    try:
        document_count = len(load_catalog().documents)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"catalog unreadable: {exc}") from exc

    return Health(status="ok", database="ok", catalog_documents=document_count)
