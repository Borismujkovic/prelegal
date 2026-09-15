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


def test_only_the_mutual_nda_is_available(client: TestClient) -> None:
    """The other ten have no cover page published upstream, so they cannot be
    filled in yet — see templates/README.md."""
    documents = client.get("/api/catalog").json()["documents"]

    available = [document["id"] for document in documents if document["available"]]
    assert available == ["mutual-nda"]


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


def test_an_available_document_has_a_cover_page() -> None:
    """Availability means fillable, and the cover page is what gets filled in."""
    for document in load_catalog().documents:
        if document.available:
            assert document.cover_page, document.id


def test_the_attribution_survives(client: TestClient) -> None:
    """Common Paper templates are CC BY 4.0; the credit has to travel with them."""
    assert "Common Paper" in client.get("/api/catalog").json()["attribution"]
