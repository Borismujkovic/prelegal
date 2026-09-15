"""Reads catalog.json.

Cached, because the file is baked into the image and cannot change while the
process is alive. Validation happens on first read, so a malformed catalog
surfaces as a startup-time health failure rather than a broken dashboard.
"""

import json
from functools import lru_cache

from prelegal.config import settings
from prelegal.models import Catalog


@lru_cache(maxsize=1)
def load_catalog() -> Catalog:
    raw = json.loads(settings.catalog_path.read_text(encoding="utf-8"))
    return Catalog.model_validate(raw)
