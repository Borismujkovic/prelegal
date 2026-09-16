"""What each draftable agreement asks the user for.

Common Paper publishes a cover page for the Mutual NDA alone. For the others,
the Standard Terms name the values they substitute but nothing says what to call
them, what kind of thing each is, or how to group them on a form. That is what
`cover-pages/<id>.json` supplies, and this module is how the backend reads it.

The same files are read by the frontend build. Authoring the labels twice, once
per language, is exactly the sort of drift no test would catch — so they are
authored once, as JSON, which both sides can read without a build step.

The Mutual NDA is deliberately absent here. It keeps the hand-written models and
prompt it has had since PL-5, so `DOCUMENT_SPECS` never contains it and the
generic route can never claim it.

Loaded lazily and cached, like `catalog.load_catalog`: a malformed overlay then
surfaces as a failed request rather than a process that will not boot, and tests
can point `settings.cover_pages_dir` somewhere else before the first read.
"""

import json
from dataclasses import dataclass
from functools import lru_cache
from typing import Literal

from prelegal.catalog import load_catalog
from prelegal.config import settings

FieldType = Literal["text", "textarea", "date"]


class UnknownDocument(Exception):
    """No such document in the catalog at all."""


class DocumentNotAvailable(Exception):
    """In the catalog, but not something Prelegal can draft yet."""


@dataclass(frozen=True)
class FieldSpec:
    """One value the user fills in."""

    #: The term as the Standard Terms spell it, e.g. `Pilot Period`.
    field: str
    #: camelCase, and what crosses the wire. Matches the frontend's field keys.
    id: str
    type: FieldType
    label: str
    hint: str
    placeholder: str
    optional: bool


@dataclass(frozen=True)
class PartyRole:
    """A party as the agreement names it — `Provider`, `Customer`, `Partner`.

    These are substitution points like any other, but they resolve from the
    signature block rather than from a field of their own, so nobody types a
    company name twice.
    """

    field: str
    label: str


@dataclass(frozen=True)
class Section:
    """A group of fields, as the form and the prompt both present them."""

    title: str
    hint: str
    fields: tuple[FieldSpec, ...]


@dataclass(frozen=True)
class DocumentSpec:
    id: str
    name: str
    summary: str
    #: What Common Paper calls this agreement's deal-terms exhibit.
    tier: str
    attaches_to: str | None
    parties: tuple[PartyRole, PartyRole]
    sections: tuple[Section, ...]
    #: Terms the Standard Terms name but nobody is asked for, because they come
    #: from the signature block — `Notice Address` is the only one so far.
    #: Carried so that the completeness check can account for every span.
    derived: tuple[str, ...]

    @property
    def fields(self) -> tuple[FieldSpec, ...]:
        return tuple(field for section in self.sections for field in section.fields)

    @property
    def described_field_names(self) -> tuple[str, ...]:
        """Every term the overlay accounts for, however it accounts for it."""
        return (
            self.parties[0].field,
            self.parties[1].field,
            *self.derived,
            *(field.field for field in self.fields),
        )


def _build(overlay: dict, entry) -> DocumentSpec:
    return DocumentSpec(
        id=overlay["id"],
        name=entry.name,
        summary=entry.summary,
        tier=overlay["tier"],
        attaches_to=entry.attaches_to,
        parties=(
            PartyRole(**overlay["parties"]["a"]),
            PartyRole(**overlay["parties"]["b"]),
        ),
        sections=tuple(
            Section(
                title=section["title"],
                hint=section["hint"],
                fields=tuple(FieldSpec(**field) for field in section["fields"]),
            )
            for section in overlay["sections"]
        ),
        derived=tuple(entry["field"] for entry in overlay.get("derived", [])),
    )


@lru_cache(maxsize=1)
def load_document_specs() -> dict[str, DocumentSpec]:
    """Every agreement the generic engine can draft, by catalog id.

    Driven by the catalog rather than by whatever happens to be on disk: a
    document is draftable because `catalog.json` says it is available, and its
    overlay must then exist. That way the flag in the catalog is the single
    switch, and a missing overlay is a loud failure rather than a document that
    quietly disappears from the product.
    """
    specs: dict[str, DocumentSpec] = {}
    for entry in load_catalog().documents:
        if not entry.available or entry.id == "mutual-nda":
            continue
        path = settings.cover_pages_dir / f"{entry.id}.json"
        overlay = json.loads(path.read_text(encoding="utf-8"))
        if overlay["id"] != entry.id:
            raise ValueError(f"{path} declares id {overlay['id']}")
        specs[entry.id] = _build(overlay, entry)
    return specs


def get_document_spec(document_id: str) -> DocumentSpec:
    """Resolve a document id, or say precisely why it cannot be drafted.

    The two failures are worth telling apart even though both end as a 404: one
    means the user asked for something Prelegal has never heard of, the other
    that they asked for something in the catalog whose turn has not come.
    """
    specs = load_document_specs()
    if document_id in specs:
        return specs[document_id]

    known = {entry.id for entry in load_catalog().documents}
    if document_id not in known:
        raise UnknownDocument(document_id)
    raise DocumentNotAvailable(document_id)
