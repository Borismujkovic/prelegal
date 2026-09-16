"""The cover page overlays, checked against the agreements they describe.

These read the real `templates/` and `cover-pages/` files rather than fixtures,
for the same reason `test_catalog.py` reads the real catalog: a fixture would
stay green while the thing the product ships was broken.

This suite is what replaces the compile-time exhaustiveness the Mutual NDA gets
from its generated union types. There, an upstream template that added a
substitution point broke every renderer that did not handle it. Here the fields
are data, so nothing would break — the new value would quietly render as a
placeholder no one could fill in. Failing here keeps the guarantee.

The frontend checks the same invariant in its own language at generate time.
That is deliberate duplication: it is what lets the backend be tested without a
Node build, and both sides fail loudly rather than one drifting silently.
"""

import json

import pytest

from prelegal.config import settings
from prelegal.document_specs import (
    DocumentNotAvailable,
    UnknownDocument,
    get_document_spec,
    load_document_specs,
)
from prelegal.fields import derive_field_names

#: The five agreements PL-6 brought online, and the number of values each one
#: leaves to be filled in. Written down so a template or overlay that quietly
#: gains or loses a field has to be acknowledged here.
EXPECTED_FIELD_COUNTS = {
    "ai-addendum": 6,
    "business-associate-agreement": 6,
    "pilot-agreement": 8,
    "service-level-agreement": 9,
    "design-partner-agreement": 9,
}

DOCUMENT_IDS = sorted(EXPECTED_FIELD_COUNTS)


def template_fields(document_id: str) -> list[str]:
    markdown = (settings.templates_dir / f"{document_id}.md").read_text(
        encoding="utf-8"
    )
    return derive_field_names(markdown)


def test_the_generic_engine_drafts_exactly_the_five_expected_documents() -> None:
    assert sorted(load_document_specs()) == DOCUMENT_IDS


def test_the_mutual_nda_is_not_in_the_generic_registry() -> None:
    """It keeps the hand-written prompt and models it has had since PL-5, so the
    parameterised route must never be able to claim it."""
    assert "mutual-nda" not in load_document_specs()


@pytest.mark.parametrize("document_id", DOCUMENT_IDS)
def test_an_overlay_describes_every_term_its_agreement_substitutes(
    document_id: str,
) -> None:
    spec = get_document_spec(document_id)
    described = set(spec.described_field_names)

    for name in template_fields(document_id):
        assert name in described, f"{document_id} never asks for {name}"


@pytest.mark.parametrize("document_id", DOCUMENT_IDS)
def test_an_overlay_describes_nothing_its_agreement_does_not_substitute(
    document_id: str,
) -> None:
    """The other direction. A stale entry would put a field on the form that
    fills nothing in the document — worse than useless, because it looks like
    it worked."""
    spec = get_document_spec(document_id)
    substituted = set(template_fields(document_id))

    for name in spec.described_field_names:
        assert name in substituted, f"{document_id} asks for unused {name}"


@pytest.mark.parametrize("document_id", DOCUMENT_IDS)
def test_the_field_counts_have_not_drifted(document_id: str) -> None:
    assert len(template_fields(document_id)) == EXPECTED_FIELD_COUNTS[document_id]


@pytest.mark.parametrize("document_id", DOCUMENT_IDS)
def test_every_field_id_is_camel_case_and_unique(document_id: str) -> None:
    """The ids are the wire format, shared with the frontend and used as the
    patch's keys, so they follow the same convention as the Mutual NDA's."""
    ids = [field.id for field in get_document_spec(document_id).fields]

    assert len(ids) == len(set(ids))
    for field_id in ids:
        assert field_id[0].islower()
        assert field_id.isalnum(), field_id


@pytest.mark.parametrize("document_id", DOCUMENT_IDS)
def test_every_field_declares_a_type_the_engine_can_render(document_id: str) -> None:
    """A dataclass will not check its own `Literal`, and an unknown type would
    otherwise surface as a KeyError deep inside the schema builder."""
    for field in get_document_spec(document_id).fields:
        assert field.type in {"text", "textarea", "date"}, field.id


@pytest.mark.parametrize("document_id", DOCUMENT_IDS)
def test_every_party_role_is_a_term_the_agreement_actually_uses(
    document_id: str,
) -> None:
    """The party roles are substitution points like any other — `Provider`,
    `Customer`, `Partner` — so naming one the template never uses would leave
    the signature block filling nothing."""
    spec = get_document_spec(document_id)
    substituted = set(template_fields(document_id))

    assert spec.parties[0].field in substituted
    assert spec.parties[1].field in substituted


@pytest.mark.parametrize("document_id", DOCUMENT_IDS)
def test_every_overlay_declares_the_id_of_the_file_it_is_in(document_id: str) -> None:
    overlay = json.loads(
        (settings.cover_pages_dir / f"{document_id}.json").read_text(encoding="utf-8")
    )

    assert overlay["id"] == document_id


def test_a_document_outside_the_catalog_is_reported_as_unknown() -> None:
    with pytest.raises(UnknownDocument):
        get_document_spec("employment-contract")


def test_a_catalog_document_without_a_cover_page_is_reported_as_unavailable() -> None:
    """The Cloud Service Agreement is real and listed; its cover page is simply
    not written yet. That is a different answer from never having heard of it."""
    with pytest.raises(DocumentNotAvailable):
        get_document_spec("cloud-service-agreement")


def test_the_mutual_nda_is_not_draftable_through_the_generic_engine() -> None:
    """Available, but not by this route — it has one of its own."""
    with pytest.raises(DocumentNotAvailable):
        get_document_spec("mutual-nda")
