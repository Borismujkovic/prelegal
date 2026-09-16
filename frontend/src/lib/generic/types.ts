/**
 * The shapes the generic drafting engine works in.
 *
 * The Mutual NDA gets its safety from closed unions the generator derives from
 * its template: add an upstream substitution point and every `switch` that does
 * not handle it stops compiling. That trick needs one document. With five, each
 * with its own field set, the equivalent would be five hand-written switches —
 * which is the duplication the generic engine exists to avoid.
 *
 * So the guarantee moves rather than disappearing. Field names here are `string`
 * and checked at generate time: `scripts/document-parser.mjs` refuses to emit a
 * document whose overlay and template disagree in either direction, so an
 * unhandled field breaks the build exactly as it did before, one phase earlier.
 * What stays a closed union is `FieldType` — small, shared by every document,
 * and switched exhaustively in the form, where a fourth type genuinely should
 * not compile until every renderer handles it.
 */

/** How a field is asked for. Exhaustively switched in `GenericForm`. */
export type FieldType = "text" | "textarea" | "date";

export type FieldSpec = {
  /** The term as the Standard Terms spell it, e.g. `Pilot Period`. */
  field: string;
  /** camelCase, and what crosses the wire. Matches the backend's patch keys. */
  id: string;
  type: FieldType;
  label: string;
  hint: string;
  placeholder: string;
  /** Optional fields are left out of the completeness count. */
  optional: boolean;
};

export type FormSection = {
  title: string;
  hint: string;
  fields: readonly FieldSpec[];
};

/**
 * A party as the agreement names it — `Provider` and `Customer`, or `Provider`
 * and `Partner`. These are substitution points like any other, but they resolve
 * from the signature block rather than from a field of their own, so nobody has
 * to type a company name twice.
 */
export type PartyRole = {
  field: string;
  label: string;
};

/**
 * A field filled from the signature block rather than asked for separately.
 *
 * Only `Notice Address` so far: the Pilot and Design Partner agreements name it
 * as a single term, but an address is something each side has, and it is
 * already collected below the signatures.
 */
export type DerivedField = {
  field: string;
  from: "partyNoticeAddress";
};

export type GenericSegment =
  | { kind: "text"; value: string }
  | { kind: "strong"; segments: readonly GenericSegment[] }
  | { kind: "link"; value: string; href: string }
  | { kind: "field"; field: string; occurrence: number };

/**
 * One clause. `depth` is 0, 1 or 2; the renderer rebuilds nested lists from it
 * and lets the browser number them, so no composite "3.2.a" is ever stored.
 */
export type ClauseNode = {
  depth: number;
  heading: string | null;
  body: readonly GenericSegment[];
};

export type GeneratedDocument = {
  id: string;
  /** The catalog's name for it, e.g. "Pilot Agreement". */
  name: string;
  /** The template's own `# ` title, which is what the document is headed with. */
  title: string;
  summary: string;
  attachesTo: string | null;
  /** CC BY 4.0 credit, which must travel with every generated document. */
  attribution: string;
  parties: { a: PartyRole; b: PartyRole };
  derived: readonly DerivedField[];
  sections: readonly FormSection[];
  clauses: readonly ClauseNode[];
};

/** One signatory block. Mirrors the backend's `Party`, camelCase included. */
export type Party = {
  name: string;
  title: string;
  company: string;
  noticeAddress: string;
};

/**
 * Everything a user has filled in.
 *
 * Deliberately two parts: `fields` is open and per-document, the parties are
 * fixed and shared. Every agreement here has exactly two sides, and keeping
 * them out of `fields` is what lets one signature block serve all five.
 */
export type GenericValues = {
  fields: Record<string, string>;
  party1: Party;
  party2: Party;
};

export const EMPTY_PARTY: Party = {
  name: "",
  title: "",
  company: "",
  noticeAddress: "",
};
