"""Request and response shapes.

Catalog models mirror catalog.json field-for-field, so the file itself stays the
source of truth and a malformed entry fails loudly at request time rather than
reaching the dashboard.
"""

from pydantic import BaseModel, EmailStr, Field


class SignInRequest(BaseModel):
    """What the fake login screen sends.

    No password field, by design — PL-4 specifies no authentication.
    """

    email: EmailStr
    display_name: str | None = Field(default=None, max_length=120)


class User(BaseModel):
    id: int
    email: str
    display_name: str
    created_at: str


class CatalogDocument(BaseModel):
    id: str
    name: str
    abbreviation: str | None
    summary: str
    use_when: str
    standard_terms: str
    cover_page: str | None
    attaches_to: str | None
    available: bool


class Catalog(BaseModel):
    version: int
    attribution: str
    documents: list[CatalogDocument]


class Health(BaseModel):
    status: str
    database: str
    catalog_documents: int
