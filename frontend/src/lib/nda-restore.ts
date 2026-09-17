/**
 * Turning a saved Mutual NDA draft back into a Cover Page.
 *
 * The generic engine's counterpart is `lib/generic/restore.ts`, and the reason
 * there are two is the reason there are two engines at all: the Cover Page has
 * named fields and two tagged unions, where the generic engine has an open map
 * of strings. A shared restorer would have to know about `ndaTerm` — which is
 * exactly the special-casing the generic engine exists to avoid.
 *
 * Same principle as the generic one: start from the defaults, accept only what
 * is recognised, never throw. A draft that reopens with one field blank is
 * recoverable; a draft that cannot be opened is not.
 */
import {
  DEFAULT_VALUES,
  EMPTY_PARTY,
  isValidYears,
  type ConfidentialityTerm,
  type CoverPageValues,
  type NdaTerm,
  type Party,
} from "./nda-fields";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function restoreParty(raw: unknown): Party {
  const source = asRecord(raw);
  if (!source) return { ...EMPTY_PARTY };

  const party = { ...EMPTY_PARTY };
  for (const key of ["name", "title", "company", "noticeAddress"] as const) {
    const value = source[key];
    if (typeof value === "string") party[key] = value;
  }
  return party;
}

/** A term is only restored if its tag and its years both survive inspection. */
function restoreFixedYears(source: Record<string, unknown>): number | null {
  const years = source.years;
  return typeof years === "number" && isValidYears(years) ? years : null;
}

function restoreNdaTerm(raw: unknown): NdaTerm {
  const source = asRecord(raw);
  if (!source) return DEFAULT_VALUES.ndaTerm;

  if (source.kind === "untilTerminated") return { kind: "untilTerminated" };
  if (source.kind === "fixed") {
    const years = restoreFixedYears(source);
    if (years !== null) return { kind: "fixed", years };
  }
  return DEFAULT_VALUES.ndaTerm;
}

function restoreConfidentialityTerm(raw: unknown): ConfidentialityTerm {
  const source = asRecord(raw);
  if (!source) return DEFAULT_VALUES.confidentialityTerm;

  if (source.kind === "perpetual") return { kind: "perpetual" };
  if (source.kind === "fixed") {
    const years = restoreFixedYears(source);
    if (years !== null) return { kind: "fixed", years };
  }
  return DEFAULT_VALUES.confidentialityTerm;
}

export function restoreCoverPageValues(raw: unknown): CoverPageValues {
  const source = asRecord(raw);
  if (!source) return { ...DEFAULT_VALUES };

  const restored: CoverPageValues = {
    ...DEFAULT_VALUES,
    ndaTerm: restoreNdaTerm(source.ndaTerm),
    confidentialityTerm: restoreConfidentialityTerm(source.confidentialityTerm),
    party1: restoreParty(source.party1),
    party2: restoreParty(source.party2),
  };

  for (const key of [
    "purpose",
    "governingLaw",
    "jurisdiction",
    "modifications",
  ] as const) {
    const value = source[key];
    if (typeof value === "string") restored[key] = value;
  }

  // Anything else would reach `formatEffectiveDate`, which returns "" for a
  // date it cannot parse — the document would then show a blank where a
  // placeholder belongs.
  const effectiveDate = source.effectiveDate;
  if (typeof effectiveDate === "string" && ISO_DATE.test(effectiveDate)) {
    restored.effectiveDate = effectiveDate;
  }

  return restored;
}
