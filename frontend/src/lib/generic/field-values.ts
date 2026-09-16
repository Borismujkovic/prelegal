/**
 * Turning what the user filled in into what the document says.
 *
 * Common Paper calls these values Variables: capitalised terms defined on the
 * cover page and referred to by name in the body. So the first mention spells
 * the value out — "the Pilot Period (90 days from the Effective Date)" — and
 * later ones just name the term. That is how the agreements are meant to read,
 * and it is why the generator counts occurrences rather than the renderer:
 * counting at render time would let the screen and the export disagree about
 * which mention was first.
 */
import type {
  FieldSpec,
  GeneratedDocument,
  GenericValues,
  Party,
} from "./types";
import { EMPTY_PARTY } from "./types";

/**
 * How one mention of a term renders.
 *
 * A closed union of three, switched exhaustively by both renderers — small and
 * shared by every document, so it earns compile-time checking in a way
 * per-document field names cannot.
 */
export type FieldRender =
  | { kind: "placeholder"; term: string }
  | { kind: "term"; term: string }
  | { kind: "termWithValue"; term: string; value: string };

export function createDefaultValues(document: GeneratedDocument): GenericValues {
  return {
    fields: Object.fromEntries(
      document.sections.flatMap((section) =>
        section.fields.map((field) => [field.id, ""]),
      ),
    ),
    party1: { ...EMPTY_PARTY },
    party2: { ...EMPTY_PARTY },
  };
}

/** The spec for a term, if the user is asked for it directly. */
export function specForField(
  document: GeneratedDocument,
  term: string,
): FieldSpec | undefined {
  return document.sections
    .flatMap((section) => section.fields)
    .find((field) => field.field === term);
}

function describeNoticeAddresses(document: GeneratedDocument, values: GenericValues) {
  const parties: [Party, string][] = [
    [values.party1, values.party1.company || document.parties.a.label],
    [values.party2, values.party2.company || document.parties.b.label],
  ];
  const given = parties.filter(([party]) => party.noticeAddress.trim());
  if (given.length === 0) return "";
  return given.map(([party, who]) => `${who}: ${party.noticeAddress}`).join("; ");
}

/**
 * What one term currently resolves to, as plain text.
 *
 * Empty means nothing has been filled in, which every caller renders as a
 * highlighted placeholder rather than a blank space — an agreement with an
 * invisible gap in it is worse than one that shows where the gap is.
 */
export function resolveValue(
  document: GeneratedDocument,
  values: GenericValues,
  term: string,
): string {
  if (term === document.parties.a.field) return values.party1.company.trim();
  if (term === document.parties.b.field) return values.party2.company.trim();

  const derived = document.derived.find((entry) => entry.field === term);
  if (derived) return describeNoticeAddresses(document, values);

  const spec = specForField(document, term);
  return spec ? (values.fields[spec.id] ?? "").trim() : "";
}

/** How a given mention of a term should render. */
export function renderField(
  document: GeneratedDocument,
  values: GenericValues,
  term: string,
  occurrence: number,
): FieldRender {
  const value = resolveValue(document, values, term);
  if (!value) return { kind: "placeholder", term };
  if (occurrence === 0) return { kind: "termWithValue", term, value };
  return { kind: "term", term };
}

/**
 * The required things still outstanding, by label.
 *
 * Both parties' companies count: an agreement with no sides named is not a
 * draft of anything. Optional fields never count, which is what keeps the
 * Design Partner Agreement's fees from blocking a free programme.
 */
export function findMissingFields(
  document: GeneratedDocument,
  values: GenericValues,
): string[] {
  const missing: string[] = [];

  if (!values.party1.company.trim()) missing.push(document.parties.a.label);
  if (!values.party2.company.trim()) missing.push(document.parties.b.label);

  // A derived term is still a gap in the document when nothing feeds it. The
  // Pilot and Design Partner agreements both say notices go to the Notice
  // Address, so leaving those blank would print a placeholder while the bar
  // claimed the draft was finished.
  if (document.derived.some((entry) => entry.from === "partyNoticeAddress")) {
    if (!values.party1.noticeAddress.trim()) {
      missing.push(`${document.parties.a.label} notice address`);
    }
    if (!values.party2.noticeAddress.trim()) {
      missing.push(`${document.parties.b.label} notice address`);
    }
  }

  for (const section of document.sections) {
    for (const field of section.fields) {
      if (field.optional) continue;
      if (!(values.fields[field.id] ?? "").trim()) missing.push(field.label);
    }
  }
  return missing;
}
