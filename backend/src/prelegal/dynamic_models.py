"""The per-document schemas handed to the model for Structured Outputs.

`response_format` takes a Pydantic class, and the class *is* the contract: it is
both the JSON Schema the provider is held to and the parser for what comes back.
With one document that class can be written out by hand, as `models.ChatTurn`
is. With five, each naming different values, it has to be built from the
document's spec — so `create_model` does here what a `class` statement does
there, and the result is the same kind of object.

Why not a single `patch: dict[str, str]` shared by every document: strict
Structured Outputs requires every property to be enumerated with
`additionalProperties: false`, and a free dict is by definition a schema with
unbounded keys. It could not be expressed strictly, so the provider would either
refuse the schema or stop enforcing it — and enforcement is the whole reason the
patch is a structured output rather than prose to be parsed. Enumerating the
keys also means the model is told the exact field names, so it cannot invent one.

Every field is `str | None` defaulting to None, exactly like `CoverPagePatch`:
absent means "leave this alone", never "clear this". That is what stops a turn
about the governing law from wiping a value given three messages earlier.
"""

from functools import lru_cache

from pydantic import BaseModel, ConfigDict, Field, create_model

from prelegal.document_specs import FieldSpec, load_document_specs
from prelegal.models import PartyPatch

#: Generous enough not to truncate a real answer, tight enough that a runaway
#: generation is rejected rather than stored.
_MAX_LENGTH = {"text": 500, "textarea": 4000}

_ISO_DATE = r"^\d{4}-\d{2}-\d{2}$"


def _patch_field(field: FieldSpec):
    """One optional key of a document's patch model."""
    if field.type == "date":
        return (str | None, Field(default=None, pattern=_ISO_DATE))
    return (str | None, Field(default=None, max_length=_MAX_LENGTH[field.type]))


@lru_cache(maxsize=1)
def _turn_models() -> dict[str, type[BaseModel]]:
    """Build one turn model per draftable document, once.

    Cached rather than rebuilt per request: `create_model` is not free, and the
    classes are immutable once made. Keyed by document id so the route can only
    ever hand the provider the schema for the document actually being drafted —
    there is nothing to discriminate at generation time, because the URL already
    said which document this is.
    """
    models: dict[str, type[BaseModel]] = {}

    for document_id, spec in load_document_specs().items():
        stem = "".join(part.title() for part in document_id.split("-"))

        patch = create_model(
            f"{stem}Patch",
            __config__=ConfigDict(extra="forbid"),
            **{field.id: _patch_field(field) for field in spec.fields},
            party1=(PartyPatch | None, None),
            party2=(PartyPatch | None, None),
        )
        patch.__doc__ = (
            f"What one turn established about the {spec.name}. "
            "An absent field means untouched, never cleared."
        )

        turn = create_model(
            f"{stem}ChatTurn",
            reply=(str, Field(max_length=2000)),
            patch=(patch, ...),
            needsFollowUp=(bool, ...),  # noqa: N815 — mirrors the frontend.
        )
        turn.__doc__ = (
            "One turn's output. `reply` is declared first so the prose is "
            "written before any value is committed to, and `needsFollowUp` last "
            "so it is decided in the light of what the turn actually changed."
        )
        models[document_id] = turn

    return models


def turn_model_for(document_id: str) -> type[BaseModel]:
    """The Structured Outputs schema for one document's chat."""
    return _turn_models()[document_id]


def clear_cache() -> None:
    """Forget the built models, so the next call rebuilds them.

    Only tests need this, and only because they point the catalog and the
    overlays somewhere else between cases. The models are derived from both, so
    clearing those without clearing this would leave schemas describing a
    catalog that is no longer loaded.
    """
    _turn_models.cache_clear()
