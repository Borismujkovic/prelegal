"""The document catalog.

The catalog under test is the real catalog.json, not a fixture — it is the file
the product ships, and the things asserted here are the invariants the dashboard
and every later document ticket rely on.
"""

from fastapi.testclient import TestClient

from prelegal.catalog import load_catalog
from prelegal.config import settings


def test_catalog_lists_all_eleven_documents(client: TestClient) -> None:
    response = client.get("/api/catalog")

    assert response.status_code == 200
    assert len(response.json()["documents"]) == 11


def test_the_six_draftable_documents_are_available(client: TestClient) -> None:
    """The remaining five are the large multi-exhibit agreements — the Cloud
    Service Agreement and its relatives — whose cover pages are still to be
    written. See cover-pages/README.md."""
    documents = client.get("/api/catalog").json()["documents"]

    available = {document["id"] for document in documents if document["available"]}
    assert available == {
        "mutual-nda",
        "ai-addendum",
        "business-associate-agreement",
        "pilot-agreement",
        "service-level-agreement",
        "design-partner-agreement",
    }


def test_every_document_has_an_id_unique_within_the_catalog(client: TestClient) -> None:
    documents = client.get("/api/catalog").json()["documents"]

    ids = [document["id"] for document in documents]
    assert len(ids) == len(set(ids))


def test_every_template_path_exists_on_disk() -> None:
    """A catalog entry pointing at a missing template is a broken document."""
    repo_root = settings.catalog_path.parent

    for document in load_catalog().documents:
        assert (repo_root / document.standard_terms).is_file(), document.id
        if document.cover_page:
            assert (repo_root / document.cover_page).is_file(), document.id


def test_attaches_to_always_names_a_real_document() -> None:
    catalog = load_catalog()
    ids = {document.id for document in catalog.documents}

    for document in catalog.documents:
        if document.attaches_to:
            assert document.attaches_to in ids, document.id


def test_an_available_document_has_something_to_fill_in() -> None:
    """Availability means fillable, and it is the cover page that gets filled in.

    Which cover page depends on the document. Common Paper published one for the
    Mutual NDA, so the catalog points at it. For the rest there was none to
    point at, and `cover-pages/<id>.json` is what supplies the fields instead —
    so this asserts that one of the two exists rather than that the catalog
    entry is populated, which would now be false for five available documents.
    """
    overlays = settings.cover_pages_dir
    repo_root = settings.catalog_path.parent

    for document in load_catalog().documents:
        if not document.available:
            continue
        published = bool(document.cover_page) and (
            repo_root / document.cover_page
        ).is_file()
        authored = (overlays / f"{document.id}.json").is_file()
        assert published or authored, document.id


def test_the_attribution_survives(client: TestClient) -> None:
    """Common Paper templates are CC BY 4.0; the credit has to travel with them."""
    assert "Common Paper" in client.get("/api/catalog").json()["attribution"]
