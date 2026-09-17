/**
 * Turning a saved draft back into values the document can render.
 *
 * What comes back from `/api/drafts/{id}` is `unknown` and genuinely is: the
 * server stores the JSON it was given without looking inside, so a draft saved
 * by an older build of this app — one with a field that has since been renamed,
 * or a document whose overlay has changed — is a shape nothing here has ever
 * seen.
 *
 * So this does not validate and reject. It starts from the document's own
 * defaults and copies across only what it recognises, field by field: a key
 * that is not one of this document's fields is dropped, a value that is not a
 * string is ignored, and anything malformed simply leaves the default in place.
 * The worst case is a draft that reopens with some fields blank, which the
 * completeness count already knows how to describe. The alternative — throwing
 * — would mean a user who cannot open their own saved work at all.
 */
import { createDefaultValues } from "./field-values";
import { EMPTY_PARTY, type GeneratedDocument, type GenericValues, type Party } from "./types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** A stored party, keeping only the four string fields we know about. */
export function restoreParty(raw: unknown): Party {
  const source = asRecord(raw);
  if (!source) return { ...EMPTY_PARTY };

  const party = { ...EMPTY_PARTY };
  for (const key of ["name", "title", "company", "noticeAddress"] as const) {
    const value = source[key];
    if (typeof value === "string") party[key] = value;
  }
  return party;
}

export function restoreGenericValues(
  document: GeneratedDocument,
  raw: unknown,
): GenericValues {
  const defaults = createDefaultValues(document);
  const source = asRecord(raw);
  if (!source) return defaults;

  const storedFields = asRecord(source.fields) ?? {};
  const fields = { ...defaults.fields };
  // Driven by the document's fields rather than by the stored keys, so a field
  // the overlay no longer has cannot come back from a draft that still carries
  // it.
  for (const id of Object.keys(fields)) {
    const value = storedFields[id];
    if (typeof value === "string") fields[id] = value;
  }

  return {
    fields,
    party1: restoreParty(source.party1),
    party2: restoreParty(source.party2),
  };
}
