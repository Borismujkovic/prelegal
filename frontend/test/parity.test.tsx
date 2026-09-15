// @vitest-environment jsdom
/**
 * The on-screen document and the markdown export are two separate renderers
 * over the same template data. These tests pin them to each other, so a change
 * to one that is not made to the other fails here rather than in a downloaded
 * agreement.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { NdaDocument } from "@/components/NdaDocument";
import { buildMarkdown } from "@/lib/markdown-export";
import {
  describeConfidentialityTerm,
  describeNdaTerm,
  resolveField,
} from "@/lib/substitutions";
import { COVER_PAGE_SECTIONS, STANDARD_TERMS } from "@/lib/nda-template.generated";
import type { CoverPageValues } from "@/lib/nda-fields";
import { COMPLETE, EMPTY, withValues } from "./fixtures";

/** Screen text with whitespace collapsed. */
function screenText(values: CoverPageValues): string {
  const { container, unmount } = render(<NdaDocument values={values} />);
  const text = (container.querySelector("article")?.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim();
  unmount();
  return text;
}

/**
 * Markdown reduced to the prose it renders as: escapes removed, emphasis and
 * link syntax unwrapped, block and table markers dropped.
 */
function markdownText(values: CoverPageValues): string {
  return buildMarkdown(values)
    .replace(/\[([^\]]*)\]\((?:[^)]*)\)/g, "$1")
    .replace(/\\([\\`*_[\]|#>+.-])/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/^\|\s*-{3}.*$/gm, "")
    .replace(/\|/g, " ")
    .replace(/^---$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

const CASES: { name: string; values: CoverPageValues }[] = [
  { name: "a complete cover page", values: COMPLETE },
  { name: "an empty cover page", values: EMPTY },
  {
    name: "open-ended terms",
    values: withValues({
      ndaTerm: { kind: "untilTerminated" },
      confidentialityTerm: { kind: "perpetual" },
    }),
  },
  {
    name: "a one-year term",
    values: withValues({
      ndaTerm: { kind: "fixed", years: 1 },
      confidentialityTerm: { kind: "fixed", years: 1 },
    }),
  },
  {
    name: "invalid term lengths",
    values: withValues({
      ndaTerm: { kind: "fixed", years: Number.NaN },
      confidentialityTerm: { kind: "fixed", years: 0 },
    }),
  },
  {
    name: "values containing markdown",
    values: withValues({
      purpose: "Evaluate *synergy* and [scale]",
      governingLaw: "Delaware `v2`",
      modifications: "- Clause 5 deleted\n1. Clause 6 amended",
    }),
  },
  {
    name: "modifications present",
    values: withValues({ modifications: "Clause 5 is deleted in its entirety." }),
  },
];

describe.each(CASES)("$name", ({ values }) => {
  it("resolves every Cover Page value the same way in both renderers", () => {
    const onScreen = screenText(values);
    const exported = markdownText(values);

    const expected = [
      resolveField("Purpose", values).text,
      resolveField("Effective Date", values).text,
      resolveField("Governing Law", values).text,
      resolveField("Jurisdiction", values).text,
      describeNdaTerm(values).text,
      describeConfidentialityTerm(values).text,
    ];

    for (const value of expected) {
      expect(onScreen, `on screen: ${value}`).toContain(value);
      expect(exported, `exported: ${value}`).toContain(value);
    }
  });

  it("carries the same clause headings in both renderers", () => {
    const onScreen = screenText(values);
    const exported = markdownText(values);

    for (const clause of STANDARD_TERMS) {
      expect(onScreen, `on screen: ${clause.heading}`).toContain(clause.heading);
      expect(exported, `exported: ${clause.heading}`).toContain(clause.heading);
    }
  });

  it("carries the same Cover Page section titles in both renderers", () => {
    const onScreen = screenText(values);
    const exported = markdownText(values);

    for (const section of COVER_PAGE_SECTIONS) {
      expect(onScreen, `on screen: ${section.title}`).toContain(section.title);
      expect(exported, `exported: ${section.title}`).toContain(section.title);
    }
  });

  it("carries the party details into both signature blocks", () => {
    const onScreen = screenText(values);
    const exported = markdownText(values);

    for (const party of [values.party1, values.party2]) {
      for (const detail of [party.name, party.company, party.title]) {
        if (!detail.trim()) continue;
        expect(onScreen, `on screen: ${detail}`).toContain(detail);
        expect(exported, `exported: ${detail}`).toContain(detail);
      }
    }
  });

  it("keeps the CC BY 4.0 attribution in both renderers", () => {
    expect(screenText(values)).toContain("CC BY 4.0");
    expect(markdownText(values)).toContain("CC BY 4.0");
  });

  it("expands a defined term on first use in both renderers", () => {
    const purpose = resolveField("Purpose", values).text;
    const expansion = `Purpose (${purpose})`;

    expect(screenText(values)).toContain(expansion);
    expect(markdownText(values)).toContain(expansion);
  });

  it("never leaves a raw value behind the definite article in either renderer", () => {
    const purpose = resolveField("Purpose", values).text;
    if (!resolveField("Purpose", values).filled) return;

    expect(screenText(values)).not.toContain(`the ${purpose} `);
    expect(markdownText(values)).not.toContain(`the ${purpose} `);
  });
});

describe("renderer parity - outstanding fields", () => {
  it("marks the same fields outstanding in both renderers", () => {
    const onScreen = screenText(EMPTY);
    const exported = markdownText(EMPTY);

    for (const placeholder of [
      "[Purpose]",
      "[Effective Date]",
      "[Governing Law]",
      "[Jurisdiction]",
    ]) {
      expect(onScreen, `on screen: ${placeholder}`).toContain(placeholder);
      expect(exported, `exported: ${placeholder}`).toContain(placeholder);
    }
  });

  it("writes None. for absent modifications in both renderers", () => {
    expect(screenText(EMPTY)).toContain("None.");
    expect(markdownText(EMPTY)).toContain("None.");
  });
});
