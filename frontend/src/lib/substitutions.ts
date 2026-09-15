/**
 * Resolves the Standard Terms' `coverpage_link` substitution points against the
 * user's Cover Page values.
 *
 * Two rendering styles are needed, because the template uses these spans in two
 * grammatically different ways:
 *
 * - Most read as plain noun phrases — "the laws of the State of {Governing
 *   Law}" — so the value is substituted directly.
 * - "Purpose" and "Effective Date" are *defined terms* preceded by a definite
 *   article: "in connection with the {Purpose}", "commences on the {Effective
 *   Date}". Substituting the raw value there produces "in connection with the
 *   Evaluating a partnership". These keep the defined term and carry the value
 *   in parentheses on first use, which is how contracts conventionally do it.
 */
import type { SubstitutionField } from "./nda-template.generated";
import {
  formatEffectiveDate,
  isValidYears,
  type CoverPageValues,
} from "./nda-fields";

export type ResolvedField = {
  /** The text to render — either the resolved value or a bracketed placeholder. */
  text: string;
  /** False when the user has not supplied this value yet. */
  filled: boolean;
};

/**
 * Fields the Standard Terms reference as defined terms rather than inlining.
 * Everything else is substituted in place.
 */
const DEFINED_TERMS = new Set<SubstitutionField>(["Purpose", "Effective Date"]);

function placeholder(field: SubstitutionField): ResolvedField {
  return { text: `[${field}]`, filled: false };
}

function filled(text: string): ResolvedField {
  return { text, filled: true };
}

/** The bare value of a Cover Page field, with no regard for surrounding prose. */
export function resolveField(
  field: SubstitutionField,
  values: CoverPageValues,
): ResolvedField {
  switch (field) {
    case "Purpose": {
      const purpose = values.purpose.trim();
      // The Purpose is quoted mid-sentence, so a trailing full stop from the
      // form would leave a stray period inside the clause.
      return purpose ? filled(purpose.replace(/\.+$/, "")) : placeholder(field);
    }

    case "Effective Date": {
      const formatted = formatEffectiveDate(values.effectiveDate);
      return formatted ? filled(formatted) : placeholder(field);
    }

    case "MNDA Term": {
      const term = values.ndaTerm;
      if (term.kind === "untilTerminated") {
        return filled("term, which continues until terminated in accordance with this MNDA");
      }
      return isValidYears(term.years)
        ? filled(`${term.years}-year term`)
        : placeholder(field);
    }

    case "Term of Confidentiality": {
      const term = values.confidentialityTerm;
      if (term.kind === "perpetual") {
        return filled("perpetual term");
      }
      return isValidYears(term.years)
        ? filled(
            `${term.years}-year period following the Effective Date (and, for trade secrets, ` +
              `until the information is no longer considered a trade secret under applicable law)`,
          )
        : placeholder(field);
    }

    case "Governing Law": {
      const law = values.governingLaw.trim();
      return law ? filled(law) : placeholder(field);
    }

    case "Jurisdiction": {
      const jurisdiction = values.jurisdiction.trim();
      return jurisdiction ? filled(jurisdiction) : placeholder(field);
    }
  }
}

/** How one substitution point should appear in the Standard Terms. */
export type FieldRender =
  /** Substitute the value directly into the sentence. */
  | { kind: "value"; value: string; filled: boolean }
  /** A defined term already introduced earlier — the label alone. */
  | { kind: "term"; term: string }
  /** A defined term's first appearance — the label plus its value. */
  | { kind: "termWithValue"; term: string; value: string; filled: boolean };

/**
 * @param occurrence Zero-based index of this span among all uses of the same
 * field across the Standard Terms, so a defined term is expanded only once.
 */
export function renderField(
  field: SubstitutionField,
  values: CoverPageValues,
  occurrence: number,
): FieldRender {
  const resolved = resolveField(field, values);

  if (!DEFINED_TERMS.has(field)) {
    return { kind: "value", value: resolved.text, filled: resolved.filled };
  }
  if (occurrence > 0) {
    return { kind: "term", term: field };
  }
  return {
    kind: "termWithValue",
    term: field,
    value: resolved.text,
    filled: resolved.filled,
  };
}

/**
 * Flattens a `FieldRender` to plain text, for the markdown export.
 *
 * @param escapeValue Applied to the substituted value — not to the defined
 * term, which comes from the template rather than from the user.
 */
export function fieldRenderToText(
  render: FieldRender,
  escapeValue: (resolved: ResolvedField) => string = ({ text }) => text,
): string {
  switch (render.kind) {
    case "value":
      return escapeValue({ text: render.value, filled: render.filled });
    case "term":
      return render.term;
    case "termWithValue":
      return `${render.term} (${escapeValue({ text: render.value, filled: render.filled })})`;
  }
}

/** How the MNDA Term reads as its own line on the Cover Page. */
export function describeNdaTerm(values: CoverPageValues): ResolvedField {
  const term = values.ndaTerm;
  if (term.kind === "untilTerminated") {
    return filled("Continues until terminated in accordance with the terms of the MNDA.");
  }
  if (!isValidYears(term.years)) {
    return { text: "[MNDA Term]", filled: false };
  }
  return filled(
    `Expires ${term.years} ${pluralYears(term.years)} from the Effective Date.`,
  );
}

/** How the Term of Confidentiality reads as its own line on the Cover Page. */
export function describeConfidentialityTerm(values: CoverPageValues): ResolvedField {
  const term = values.confidentialityTerm;
  if (term.kind === "perpetual") {
    return filled("In perpetuity.");
  }
  if (!isValidYears(term.years)) {
    return { text: "[Term of Confidentiality]", filled: false };
  }
  return filled(
    `${term.years} ${pluralYears(term.years)} from the Effective Date, but in the case of ` +
      `trade secrets until the Confidential Information is no longer considered a trade ` +
      `secret under applicable laws.`,
  );
}

function pluralYears(years: number): string {
  return years === 1 ? "year" : "years";
}
