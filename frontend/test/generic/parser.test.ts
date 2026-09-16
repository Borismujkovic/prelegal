/**
 * The parser behind `scripts/generate-documents.mjs`.
 *
 * Exercised against hand-written snippets, because these are edge cases and a
 * snippet states the case far more plainly than a 40KB agreement that happens
 * to contain it. `registry.test.ts` is where the real templates get read.
 *
 * The overlay checks matter most: they are what stands in for the compile-time
 * exhaustiveness the Mutual NDA gets from its generated union types.
 */
import { describe, expect, it } from "vitest";
import {
  deriveFieldNames,
  normaliseFieldName,
  parseStandardTerms,
  tokenize,
  unwrapTransparentSpans,
  validateOverlay,
} from "../../scripts/document-parser.mjs";

const field = (cls: string, text: string) =>
  `<span class="${cls}_link">${text}</span>`;

describe("normalising a field name", () => {
  it("collapses a curly possessive onto the bare term", () => {
    expect(normaliseFieldName("Provider’s")).toBe("Provider");
  });

  it("collapses a straight possessive too", () => {
    expect(normaliseFieldName("Partner's")).toBe("Partner");
  });

  it("leaves an ordinary term alone", () => {
    expect(normaliseFieldName(" Governing Law ")).toBe("Governing Law");
  });
});

describe("transparent spans", () => {
  it("drops an empty numbering span", () => {
    expect(unwrapTransparentSpans('<span id="4.1"></span>**"Term"**')).toBe(
      '**"Term"**',
    );
  });

  it("unwraps one that carries its own text", () => {
    expect(unwrapTransparentSpans('<span id="4.1">**"Term"**</span> means')).toBe(
      '**"Term"** means',
    );
  });

  it("never touches a span that has a class", () => {
    const line = field("keyterms", "Fees");
    expect(unwrapTransparentSpans(line)).toBe(line);
  });
});

describe("tokenizing a clause body", () => {
  it("recognises every field span class", () => {
    for (const cls of ["coverpage", "keyterms", "orderform", "businessterms", "sow"]) {
      expect(tokenize(field(cls, "Fees"))).toEqual([
        { kind: "field", field: "Fees" },
      ]);
    }
  });

  it("finds a field nested inside a bold run", () => {
    // The Pilot Agreement's liability cap is written exactly this way. Matching
    // bold as a flat string would swallow the span and lose the field.
    const segments = tokenize(`**no more than the ${field("orderform", "General Cap Amount")}.**`);

    expect(segments).toEqual([
      {
        kind: "strong",
        segments: [
          { kind: "text", value: "no more than the " },
          { kind: "field", field: "General Cap Amount" },
          { kind: "text", value: "." },
        ],
      },
    ]);
  });

  it("keeps links intact", () => {
    expect(tokenize("see [the terms](https://example.com)")).toEqual([
      { kind: "text", value: "see " },
      { kind: "link", value: "the terms", href: "https://example.com" },
    ]);
  });
});

describe("parsing standard terms", () => {
  const AGREEMENT = [
    "# Pilot Agreement",
    "",
    '1. <span class="header_2" id="1">Pilot Access</span>',
    `    1. <span class="header_3" id="1.1">Access.</span>  During the ${field("orderform", "Pilot Period")}.`,
    "        a. if the other party fails to cure a material breach;",
    '2. <span class="header_2">Fees</span>',
    `    1. ${field("keyterms", "Partner")} will pay the ${field("keyterms", "Fees")}.`,
  ].join("\n");

  it("reads the title from the heading", () => {
    expect(parseStandardTerms(AGREEMENT).title).toBe("Pilot Agreement");
  });

  it("records each clause at the depth its indentation implies", () => {
    const { nodes } = parseStandardTerms(AGREEMENT);
    expect(nodes.map((node) => node.depth)).toEqual([0, 1, 2, 0, 1]);
  });

  it("takes the heading from a header span, with or without an id", () => {
    const { nodes } = parseStandardTerms(AGREEMENT);
    expect(nodes[0].heading).toBe("Pilot Access");
    expect(nodes[3].heading).toBe("Fees");
  });

  it("accepts a clause with no heading of its own", () => {
    // The Design Partner Agreement's fees clause is a bare sentence.
    const { nodes } = parseStandardTerms(AGREEMENT);
    expect(nodes[4].heading).toBeNull();
  });

  it("collects every field in first-use order", () => {
    const { nodes } = parseStandardTerms(AGREEMENT);
    expect(deriveFieldNames(nodes)).toEqual(["Pilot Period", "Partner", "Fees"]);
  });

  it("handles CRLF line endings, which the templates use", () => {
    const { nodes } = parseStandardTerms(AGREEMENT.replace(/\n/g, "\r\n"));
    expect(nodes).toHaveLength(5);
  });

  it("refuses unexpected indentation rather than guessing", () => {
    expect(() => parseStandardTerms("# A\n  1. odd indent")).toThrow(/indentation/);
  });

  it("refuses a line that is not a list item", () => {
    expect(() => parseStandardTerms("# A\nnot a clause")).toThrow(/list marker/);
  });

  it("refuses a file with no title", () => {
    expect(() => parseStandardTerms("1. something")).toThrow(/title/);
  });
});

describe("validating an overlay against its agreement", () => {
  const overlay = {
    id: "example",
    parties: { a: { field: "Provider" }, b: { field: "Customer" } },
    derived: [{ field: "Notice Address" }],
    sections: [
      { fields: [{ field: "Pilot Period", id: "pilotPeriod" }] },
    ],
  };
  const derived = ["Provider", "Customer", "Notice Address", "Pilot Period"];

  it("passes when the two agree exactly", () => {
    expect(validateOverlay(overlay, derived, "overlay")).toBe(true);
  });

  it("refuses a term the agreement substitutes but nobody asks for", () => {
    expect(() =>
      validateOverlay(overlay, [...derived, "Governing Law"], "overlay"),
    ).toThrow(/does not describe the field "Governing Law"/);
  });

  it("refuses a term the overlay asks for but the agreement never uses", () => {
    // A stale entry puts a field on the form that fills nothing in — worse than
    // useless, because it looks like it worked.
    expect(() => validateOverlay(overlay, derived.slice(0, 3), "overlay")).toThrow(
      /never substitute/,
    );
  });

  it("refuses a duplicated term", () => {
    const duplicated = {
      ...overlay,
      derived: [{ field: "Provider" }, { field: "Notice Address" }],
    };
    expect(() => validateOverlay(duplicated, derived, "overlay")).toThrow(
      /more than once/,
    );
  });

  it("refuses a field id that is not camelCase", () => {
    const shouty = {
      ...overlay,
      sections: [{ fields: [{ field: "Pilot Period", id: "pilot_period" }] }],
    };
    expect(() => validateOverlay(shouty, derived, "overlay")).toThrow(/camelCase/);
  });
});
