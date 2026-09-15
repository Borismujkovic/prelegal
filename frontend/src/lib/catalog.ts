/**
 * The document catalog, as served by the backend from catalog.json.
 *
 * Types mirror the JSON field-for-field, snake_case included, so the file stays
 * the single source of truth and there is no mapping layer to drift.
 */

export type CatalogDocument = {
  id: string;
  name: string;
  abbreviation: string | null;
  summary: string;
  use_when: string;
  standard_terms: string;
  cover_page: string | null;
  attaches_to: string | null;
  available: boolean;
};

export type Catalog = {
  version: number;
  attribution: string;
  documents: CatalogDocument[];
};

/** The route that drafts a given document, or null if it is not built yet. */
export function draftingRouteFor(document: CatalogDocument): string | null {
  return document.available ? `/documents/${document.id}` : null;
}

export async function fetchCatalog(signal?: AbortSignal): Promise<Catalog> {
  const response = await fetch("/api/catalog", { signal });
  if (!response.ok) {
    throw new Error("Could not load the document catalog.");
  }
  return (await response.json()) as Catalog;
}
