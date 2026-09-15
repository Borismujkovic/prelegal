/** Shared Cover Page values for the test suites. */
import type { CoverPageValues } from "@/lib/nda-fields";
import { DEFAULT_VALUES } from "@/lib/nda-fields";

/** Every required field supplied — the document is fit to download. */
export const COMPLETE: CoverPageValues = {
  purpose: "Evaluating a potential partnership.",
  effectiveDate: "2026-03-09",
  ndaTerm: { kind: "fixed", years: 2 },
  confidentialityTerm: { kind: "fixed", years: 3 },
  governingLaw: "Delaware",
  jurisdiction: "New Castle, DE",
  modifications: "",
  party1: {
    name: "Jane Doe",
    title: "Chief Executive Officer",
    company: "Acme, Inc.",
    noticeAddress: "legal@acme.com",
  },
  party2: {
    name: "John Roe",
    title: "Chief Technology Officer",
    company: "Globex LLC",
    noticeAddress: "legal@globex.com",
  },
};

/** Nothing filled in — every substitution point renders as a placeholder. */
export const EMPTY: CoverPageValues = DEFAULT_VALUES;

export function withValues(patch: Partial<CoverPageValues>): CoverPageValues {
  return { ...COMPLETE, ...patch };
}
