/**
 * The markdown a user downloads.
 *
 * Parity with the on-screen document is covered in `parity.test.tsx`. What is
 * here is what only the export has to get right: numbering it recomputes, and
 * escaping, since a user's own words go into a format where punctuation is
 * structure.
 */
import { describe, expect, it } from "vitest";
import { DOCUMENT_REGISTRY } from "@/lib/generated";
import { createDefaultValues } from "@/lib/generic/field-values";
import { buildFilename, buildMarkdown } from "@/lib/generic/markdown-export";
import type { GenericValues } from "@/lib/generic/types";

const pilot = DOCUMENT_REGISTRY["pilot-agreement"];

function withValues(overrides: Partial<GenericValues> = {}): GenericValues {
  const base = createDefaultValues(pilot);
  return {
    fields: { ...base.fields, ...overrides.fields },
    party1: { ...base.party1, ...overrides.party1 },
    party2: { ...base.party2, ...overrides.party2 },
  };
}

describe("structure", () => {
  const markdown = buildMarkdown(pilot, withValues());

  it("opens with the agreement's own title", () => {
    expect(markdown.startsWith(`# ${pilot.title}`)).toBe(true);
  });

  it("numbers top-level clauses from one", () => {
    expect(markdown).toMatch(/^1\. \*\*Pilot Access\*\*/m);
  });

  it("indents and renumbers nested clauses", () => {
    expect(markdown).toMatch(/^ {4}1\. /m);
  });

  it("letters the third level", () => {
    expect(markdown).toMatch(/^ {8}a\. /m);
  });

  it("ends with the licence attribution", () => {
    expect(markdown.trimEnd().endsWith(pilot.attribution)).toBe(true);
  });

  it("includes a signature block for both parties", () => {
    expect(markdown).toContain(`### ${pilot.parties.a.label}`);
    expect(markdown).toContain(`### ${pilot.parties.b.label}`);
    expect(markdown).toContain("- Signature: ");
  });
});

describe("substitution", () => {
  it("spells a value out on its first mention and names the term after", () => {
    const markdown = buildMarkdown(
      pilot,
      withValues({ fields: { pilotPeriod: "90 days" } }),
    );

    expect(markdown).toContain("**Pilot Period** (90 days)");
    // Mentioned three times in this agreement; only the first carries the value.
    expect(markdown.match(/\*\*Pilot Period\*\* \(90 days\)/g)).toHaveLength(1);
  });

  it("leaves an unfilled term as a visible bracket", () => {
    expect(buildMarkdown(pilot, withValues())).toContain("[Pilot Period]");
  });
});

describe("escaping what the user typed", () => {
  it("neutralises markdown in a value", () => {
    const markdown = buildMarkdown(
      pilot,
      withValues({ fields: { pilotPeriod: "30 days *or* until [done]" } }),
    );

    expect(markdown).toContain("30 days \\*or\\* until \\[done\\]");
  });

  it("stops a notice address from becoming a list", () => {
    const markdown = buildMarkdown(
      pilot,
      withValues({
        party1: { company: "Acme", noticeAddress: "- not a bullet" } as never,
      }),
    );

    expect(markdown).toContain("\\- not a bullet");
  });

  it("does not escape the template's own emphasis", () => {
    // The Standard Terms are verbatim Common Paper; escaping them would break
    // the agreement's own formatting.
    expect(buildMarkdown(pilot, withValues())).toMatch(/\*\*Pilot Access\*\*/);
  });
});

describe("the filename", () => {
  it("names both companies once they are known", () => {
    const values = withValues({
      party1: { company: "Acme, Inc." } as never,
      party2: { company: "Globex Ltd" } as never,
    });

    expect(buildFilename(pilot, values)).toBe("pilot-agreement-acme-inc-globex-ltd.md");
  });

  it("falls back to the document id before the parties are known", () => {
    expect(buildFilename(pilot, withValues())).toBe("pilot-agreement.md");
  });
});
