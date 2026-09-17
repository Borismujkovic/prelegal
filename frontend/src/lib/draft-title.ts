/**
 * What a saved draft is called in the list.
 *
 * Derived rather than asked for. A dialog demanding a name before you can save
 * is a step between the user and the thing they wanted, and the two facts that
 * actually distinguish one draft from another — which agreement it is, and who
 * it is with — are already on the page.
 *
 * Shared by both engines, which is safe in a way sharing a *values* type would
 * not be: the inputs here are three strings, not a document shape.
 */

/** The server's own cap, mirrored so a long company name fails on the form. */
export const MAX_DRAFT_TITLE_LENGTH = 200;

export function buildDraftTitle(
  documentName: string,
  company1: string,
  company2: string,
): string {
  const parties = [company1, company2].map((name) => name.trim()).filter(Boolean);
  const title = parties.length > 0 ? `${documentName} — ${parties.join(" & ")}` : documentName;

  return title.length > MAX_DRAFT_TITLE_LENGTH
    ? `${title.slice(0, MAX_DRAFT_TITLE_LENGTH - 1).trimEnd()}…`
    : title;
}
