"""The document catalog: what Prelegal can draft."""

from fastapi import APIRouter

from prelegal.catalog import load_catalog
from prelegal.models import Catalog

router = APIRouter(prefix="/api", tags=["catalog"])


@router.get("/catalog", response_model=Catalog)
def get_catalog() -> Catalog:
    return load_catalog()
