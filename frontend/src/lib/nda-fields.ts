/**
 * The deal-specific values a user fills in on the Mutual NDA Cover Page.
 *
 * Common Paper splits an agreement into boilerplate Standard Terms plus a short
 * Cover Page carrying the negotiated values; these types model the Cover Page.
 * The Standard Terms text itself lives in `nda-template.generated.ts`.
 */

/** "Expires N years from the Effective Date" or "continues until terminated". */
export type NdaTerm =
  | { kind: "fixed"; years: number }
  | { kind: "untilTerminated" };

/** "N years from the Effective Date" or "in perpetuity". */
export type ConfidentialityTerm =
  | { kind: "fixed"; years: number }
  | { kind: "perpetual" };

/** One signatory block on the Cover Page. */
export type Party = {
  name: string;
  title: string;
  company: string;
  noticeAddress: string;
};

export type CoverPageValues = {
  purpose: string;
  /** ISO `yyyy-mm-dd`, as produced by an `<input type="date">`. */
  effectiveDate: string;
  ndaTerm: NdaTerm;
  confidentialityTerm: ConfidentialityTerm;
  governingLaw: string;
  jurisdiction: string;
  modifications: string;
  party1: Party;
  party2: Party;
};

export const EMPTY_PARTY: Party = {
  name: "",
  title: "",
  company: "",
  noticeAddress: "",
};

/**
 * The party details that appear in the signature block, labelled as the Cover
 * Page labels them. Shared by the on-screen document and the markdown export so
 * the two cannot drift apart; each places Signature and Date itself, since those
 * are blank lines completed at signing rather than values from the form.
 */
export const PARTY_FIELDS: readonly {
  label: string;
  get: (party: Party) => string;
}[] = [
  { label: "Print Name", get: (party) => party.name },
  { label: "Title", get: (party) => party.title },
  { label: "Company", get: (party) => party.company },
  { label: "Notice Address", get: (party) => party.noticeAddress },
];

/**
 * Starting values. The Cover Page template's bracketed hints (`[Today's date]`,
 * `[1 year(s)]`) become placeholders and defaults rather than prefilled text,
 * so nothing appears in the document that the user did not actually choose.
 *
 * `effectiveDate` is deliberately empty: defaulting it to "today" would compute
 * a different value on the server than in the browser when their timezones
 * differ, which breaks hydration.
 */
export const DEFAULT_VALUES: CoverPageValues = {
  purpose: "",
  effectiveDate: "",
  ndaTerm: { kind: "fixed", years: 1 },
  confidentialityTerm: { kind: "fixed", years: 1 },
  governingLaw: "",
  jurisdiction: "",
  modifications: "",
  party1: { ...EMPTY_PARTY },
  party2: { ...EMPTY_PARTY },
};

/** Fields required before the document is fit to download. */
const REQUIRED: readonly { label: string; get: (v: CoverPageValues) => string }[] = [
  { label: "Purpose", get: (v) => v.purpose },
  { label: "Effective Date", get: (v) => v.effectiveDate },
  { label: "Governing Law", get: (v) => v.governingLaw },
  { label: "Jurisdiction", get: (v) => v.jurisdiction },
  { label: "Party 1 name", get: (v) => v.party1.name },
  { label: "Party 1 company", get: (v) => v.party1.company },
  { label: "Party 2 name", get: (v) => v.party2.name },
  { label: "Party 2 company", get: (v) => v.party2.company },
];

/**
 * Returns the human-readable labels of everything still outstanding. An empty
 * array means the document is complete.
 */
export function findMissingFields(values: CoverPageValues): string[] {
  const missing = REQUIRED.filter((field) => field.get(values).trim() === "").map(
    (field) => field.label,
  );

  if (values.ndaTerm.kind === "fixed" && !isValidYears(values.ndaTerm.years)) {
    missing.push("MNDA Term length");
  }
  if (
    values.confidentialityTerm.kind === "fixed" &&
    !isValidYears(values.confidentialityTerm.years)
  ) {
    missing.push("Term of Confidentiality length");
  }
  return missing;
}

export function isValidYears(years: number): boolean {
  return Number.isInteger(years) && years > 0;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Formats an ISO date as US legal long form ("September 14, 2026").
 *
 * Done by hand rather than via `toLocaleDateString` so the output is identical
 * on the server and in the browser regardless of locale or timezone.
 */
export function formatEffectiveDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return "";

  const [, year, month, day] = match;
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) return "";

  return `${monthName} ${Number(day)}, ${year}`;
}
