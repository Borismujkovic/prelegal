import { describe, expect, it } from "vitest";
import {
  describeConfidentialityTerm,
  describeNdaTerm,
  fieldRenderToText,
  renderField,
  resolveField,
} from "@/lib/substitutions";
import type { SubstitutionField } from "@/lib/nda-template.generated";
import { COMPLETE, EMPTY, withValues } from "./fixtures";

const ALL_FIELDS: SubstitutionField[] = [
  "Purpose",
  "Effective Date",
  "MNDA Term",
  "Term of Confidentiality",
  "Governing Law",
  "Jurisdiction",
];

/** The two fields the Standard Terms reference as defined terms. */
const DEFINED: SubstitutionField[] = ["Purpose", "Effective Date"];
const INLINE = ALL_FIELDS.filter((field) => !DEFINED.includes(field));

/** Nothing supplied, including both term lengths. */
const BLANK = withValues({
  purpose: "",
  effectiveDate: "",
  governingLaw: "",
  jurisdiction: "",
  ndaTerm: { kind: "fixed", years: Number.NaN },
  confidentialityTerm: { kind: "fixed", years: Number.NaN },
});

describe("resolveField - unfilled", () => {
  it("renders a bracketed placeholder for every field", () => {
    for (const field of ALL_FIELDS) {
      expect(resolveField(field, BLANK), `field: ${field}`).toEqual({
        text: `[${field}]`,
        filled: false,
      });
    }
  });

  it("treats whitespace-only text as unfilled", () => {
    expect(resolveField("Purpose", withValues({ purpose: "   " })).filled).toBe(false);
    expect(resolveField("Governing Law", withValues({ governingLaw: " \t " })).filled).toBe(false);
    expect(resolveField("Jurisdiction", withValues({ jurisdiction: "\n" })).filled).toBe(false);
  });
});

describe("resolveField - Purpose", () => {
  it("uses the value as written", () => {
    expect(resolveField("Purpose", withValues({ purpose: "Evaluating a partnership" }))).toEqual({
      text: "Evaluating a partnership",
      filled: true,
    });
  });

  it("trims surrounding whitespace", () => {
    expect(resolveField("Purpose", withValues({ purpose: "  Evaluating a deal  " })).text).toBe(
      "Evaluating a deal",
    );
  });

  it("strips a trailing full stop, which would otherwise land mid-clause", () => {
    // The clause reads "in connection with the Purpose (...)", so a trailing
    // period from the form would produce "... a partnership.)".
    expect(resolveField("Purpose", withValues({ purpose: "Evaluating a partnership." })).text).toBe(
      "Evaluating a partnership",
    );
    expect(
      resolveField("Purpose", withValues({ purpose: "Evaluating a partnership..." })).text,
    ).toBe("Evaluating a partnership");
  });

  it("keeps full stops that are not at the end", () => {
    expect(
      resolveField("Purpose", withValues({ purpose: "A deal with Acme Inc. and others." })).text,
    ).toBe("A deal with Acme Inc. and others");
  });

  it("keeps other terminal punctuation", () => {
    expect(resolveField("Purpose", withValues({ purpose: "Why not?" })).text).toBe("Why not?");
    expect(resolveField("Purpose", withValues({ purpose: "A deal!" })).text).toBe("A deal!");
  });
});

describe("resolveField - Effective Date", () => {
  it("renders the formatted long-form date", () => {
    expect(resolveField("Effective Date", withValues({ effectiveDate: "2026-03-09" }))).toEqual({
      text: "March 9, 2026",
      filled: true,
    });
  });

  it("falls back to a placeholder for an unparseable date", () => {
    expect(resolveField("Effective Date", withValues({ effectiveDate: "2026-13-40" }))).toEqual({
      text: "[Effective Date]",
      filled: false,
    });
  });
});

describe("resolveField - MNDA Term", () => {
  it("renders a fixed term as an N-year term", () => {
    expect(
      resolveField("MNDA Term", withValues({ ndaTerm: { kind: "fixed", years: 2 } })).text,
    ).toBe("2-year term");
    expect(
      resolveField("MNDA Term", withValues({ ndaTerm: { kind: "fixed", years: 1 } })).text,
    ).toBe("1-year term");
  });

  it("renders the open-ended term as prose that fits the clause", () => {
    const resolved = resolveField(
      "MNDA Term",
      withValues({ ndaTerm: { kind: "untilTerminated" } }),
    );
    expect(resolved.filled).toBe(true);
    expect(resolved.text).toBe(
      "term, which continues until terminated in accordance with this MNDA",
    );
  });

  it("falls back to a placeholder for an invalid length", () => {
    for (const years of [0, -2, 1.5, Number.NaN]) {
      expect(
        resolveField("MNDA Term", withValues({ ndaTerm: { kind: "fixed", years } })),
        `years: ${years}`,
      ).toEqual({ text: "[MNDA Term]", filled: false });
    }
  });
});

describe("resolveField - Term of Confidentiality", () => {
  it("renders a fixed term with the trade-secret carve-out", () => {
    const resolved = resolveField(
      "Term of Confidentiality",
      withValues({ confidentialityTerm: { kind: "fixed", years: 3 } }),
    );
    expect(resolved.filled).toBe(true);
    expect(resolved.text).toBe(
      "3-year period following the Effective Date (and, for trade secrets, " +
        "until the information is no longer considered a trade secret under applicable law)",
    );
  });

  it("renders a perpetual term", () => {
    expect(
      resolveField(
        "Term of Confidentiality",
        withValues({ confidentialityTerm: { kind: "perpetual" } }),
      ),
    ).toEqual({ text: "perpetual term", filled: true });
  });

  it("falls back to a placeholder for an invalid length", () => {
    expect(
      resolveField(
        "Term of Confidentiality",
        withValues({ confidentialityTerm: { kind: "fixed", years: 0 } }),
      ),
    ).toEqual({ text: "[Term of Confidentiality]", filled: false });
  });
});

describe("resolveField - Governing Law and Jurisdiction", () => {
  it("substitutes the value directly", () => {
    expect(resolveField("Governing Law", withValues({ governingLaw: "Delaware" })).text).toBe(
      "Delaware",
    );
    expect(resolveField("Jurisdiction", withValues({ jurisdiction: "New Castle, DE" })).text).toBe(
      "New Castle, DE",
    );
  });

  it("trims whitespace", () => {
    expect(resolveField("Governing Law", withValues({ governingLaw: "  Delaware " })).text).toBe(
      "Delaware",
    );
  });
});

describe("renderField", () => {
  it("substitutes inline fields directly at every occurrence", () => {
    for (const field of INLINE) {
      for (const occurrence of [0, 1, 5]) {
        expect(renderField(field, COMPLETE, occurrence).kind, `${field} @${occurrence}`).toBe(
          "value",
        );
      }
    }
  });

  it("spells out a defined term with its value on first use", () => {
    expect(renderField("Purpose", COMPLETE, 0)).toEqual({
      kind: "termWithValue",
      term: "Purpose",
      value: "Evaluating a potential partnership",
      filled: true,
    });
    expect(renderField("Effective Date", COMPLETE, 0)).toEqual({
      kind: "termWithValue",
      term: "Effective Date",
      value: "March 9, 2026",
      filled: true,
    });
  });

  it("uses the bare term on every later use", () => {
    for (const occurrence of [1, 2, 9]) {
      expect(renderField("Purpose", COMPLETE, occurrence), `@${occurrence}`).toEqual({
        kind: "term",
        term: "Purpose",
      });
    }
  });

  it("still names the term on first use when the value is missing", () => {
    expect(renderField("Purpose", EMPTY, 0)).toEqual({
      kind: "termWithValue",
      term: "Purpose",
      value: "[Purpose]",
      filled: false,
    });
  });

  it("never substitutes the raw value behind the definite article", () => {
    // The bug this guards: "in connection with the Evaluating a partnership".
    expect(renderField("Purpose", COMPLETE, 0).kind).not.toBe("value");
    expect(renderField("Effective Date", COMPLETE, 0).kind).not.toBe("value");
  });
});

describe("fieldRenderToText", () => {
  it("flattens each render kind", () => {
    expect(fieldRenderToText({ kind: "value", value: "Delaware", filled: true })).toBe("Delaware");
    expect(fieldRenderToText({ kind: "term", term: "Purpose" })).toBe("Purpose");
    expect(
      fieldRenderToText({ kind: "termWithValue", term: "Purpose", value: "a deal", filled: true }),
    ).toBe("Purpose (a deal)");
  });

  it("applies the escape function to the value", () => {
    const shout = ({ text }: { text: string }) => text.toUpperCase();
    expect(fieldRenderToText({ kind: "value", value: "delaware", filled: true }, shout)).toBe(
      "DELAWARE",
    );
    expect(
      fieldRenderToText(
        { kind: "termWithValue", term: "Purpose", value: "a deal", filled: true },
        shout,
      ),
    ).toBe("Purpose (A DEAL)");
  });

  it("does not escape the defined term itself, which comes from the template", () => {
    const shout = ({ text }: { text: string }) => text.toUpperCase();
    expect(fieldRenderToText({ kind: "term", term: "Purpose" }, shout)).toBe("Purpose");
  });

  it("passes the filled flag through to the escape function", () => {
    const seen: boolean[] = [];
    fieldRenderToText({ kind: "value", value: "[Purpose]", filled: false }, ({ text, filled }) => {
      seen.push(filled);
      return text;
    });
    expect(seen).toEqual([false]);
  });
});

describe("describeNdaTerm", () => {
  it("pluralises the year count", () => {
    expect(describeNdaTerm(withValues({ ndaTerm: { kind: "fixed", years: 1 } })).text).toBe(
      "Expires 1 year from the Effective Date.",
    );
    expect(describeNdaTerm(withValues({ ndaTerm: { kind: "fixed", years: 2 } })).text).toBe(
      "Expires 2 years from the Effective Date.",
    );
  });

  it("describes the open-ended term", () => {
    expect(describeNdaTerm(withValues({ ndaTerm: { kind: "untilTerminated" } }))).toEqual({
      text: "Continues until terminated in accordance with the terms of the MNDA.",
      filled: true,
    });
  });

  it("falls back to a placeholder for an invalid length", () => {
    expect(describeNdaTerm(withValues({ ndaTerm: { kind: "fixed", years: Number.NaN } }))).toEqual({
      text: "[MNDA Term]",
      filled: false,
    });
  });
});

describe("describeConfidentialityTerm", () => {
  it("pluralises the year count", () => {
    expect(
      describeConfidentialityTerm(withValues({ confidentialityTerm: { kind: "fixed", years: 1 } }))
        .text,
    ).toMatch(/^1 year from the Effective Date, but in the case of trade secrets/);
    expect(
      describeConfidentialityTerm(withValues({ confidentialityTerm: { kind: "fixed", years: 5 } }))
        .text,
    ).toMatch(/^5 years from the Effective Date, but in the case of trade secrets/);
  });

  it("describes a perpetual term", () => {
    expect(
      describeConfidentialityTerm(withValues({ confidentialityTerm: { kind: "perpetual" } })),
    ).toEqual({ text: "In perpetuity.", filled: true });
  });

  it("falls back to a placeholder for an invalid length", () => {
    expect(
      describeConfidentialityTerm(withValues({ confidentialityTerm: { kind: "fixed", years: -1 } })),
    ).toEqual({ text: "[Term of Confidentiality]", filled: false });
  });
});

describe("cover page descriptions vs clause substitutions", () => {
  it("word the same term differently for their two positions", () => {
    // The Cover Page line stands alone as a sentence; the clause substitution
    // has to read inside one. They are deliberately not the same string.
    const values = withValues({ ndaTerm: { kind: "fixed", years: 2 } });
    expect(describeNdaTerm(values).text).toBe("Expires 2 years from the Effective Date.");
    expect(resolveField("MNDA Term", values).text).toBe("2-year term");
  });

  it("agree on whether a value is filled", () => {
    for (const years of [1, 5, 0, Number.NaN]) {
      const values = withValues({ ndaTerm: { kind: "fixed", years } });
      expect(describeNdaTerm(values).filled, `years: ${years}`).toBe(
        resolveField("MNDA Term", values).filled,
      );
    }
    for (const years of [1, 5, 0, Number.NaN]) {
      const values = withValues({ confidentialityTerm: { kind: "fixed", years } });
      expect(describeConfidentialityTerm(values).filled, `years: ${years}`).toBe(
        resolveField("Term of Confidentiality", values).filled,
      );
    }
  });
});
