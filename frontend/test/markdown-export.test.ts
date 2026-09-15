import { describe, expect, it } from "vitest";
import { buildFilename, buildMarkdown } from "@/lib/markdown-export";
import {
  COVER_PAGE_SECTIONS,
  COVER_PAGE_SIGNATURE_INTRO,
  COVER_PAGE_TITLE,
  STANDARD_TERMS,
} from "@/lib/nda-template.generated";
import { COMPLETE, EMPTY, withValues } from "./fixtures";

/** How many times `needle` appears in `haystack`. */
function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("buildMarkdown - structure", () => {
  const markdown = buildMarkdown(COMPLETE);

  it("opens with the agreement title", () => {
    expect(markdown.startsWith(`# ${COVER_PAGE_TITLE}\n`)).toBe(true);
  });

  it("includes every Cover Page section heading, in template order", () => {
    const headings = COVER_PAGE_SECTIONS.map((section) => `### ${section.title}`);
    const positions = headings.map((heading) => markdown.indexOf(heading));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("separates the Cover Page from the Standard Terms", () => {
    const rule = markdown.indexOf("\n---\n");
    const standardTerms = markdown.indexOf("# Standard Terms");
    expect(rule).toBeGreaterThan(0);
    expect(standardTerms).toBeGreaterThan(rule);
  });

  it("includes the signature intro and a signature table", () => {
    expect(markdown).toContain(COVER_PAGE_SIGNATURE_INTRO);
    expect(markdown).toContain("| | PARTY 1 | PARTY 2 |");
    expect(markdown).toContain("| --- | --- | --- |");
  });

  it("leaves Signature and Date blank for completion at signing", () => {
    expect(markdown).toContain("| Signature |  |  |");
    expect(markdown).toContain("| Date |  |  |");
  });

  it("carries the party details into the signature table", () => {
    expect(markdown).toContain("| Print Name | Jane Doe | John Roe |");
    expect(markdown).toContain("| Company | Acme, Inc. | Globex LLC |");
    expect(markdown).toContain("| Notice Address | legal@acme.com | legal@globex.com |");
  });

  it("numbers every Standard Terms clause with its heading", () => {
    for (const clause of STANDARD_TERMS) {
      expect(markdown, `clause ${clause.number}`).toContain(
        `${clause.number}. **${clause.heading}**.`,
      );
    }
  });

  it("keeps the CC BY 4.0 attribution on both halves of the document", () => {
    // templates/README.md requires the attribution to travel with the output.
    const attribution = "[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)";
    expect(count(markdown, attribution)).toBe(2);
  });

  it("ends with exactly one trailing newline", () => {
    expect(markdown.endsWith("\n")).toBe(true);
    expect(markdown.endsWith("\n\n")).toBe(false);
  });

  it("separates every block with a blank line", () => {
    expect(markdown).not.toMatch(/[^\n]\n#/);
  });
});

describe("buildMarkdown - values", () => {
  it("writes the supplied values into the Cover Page", () => {
    const markdown = buildMarkdown(COMPLETE);
    expect(markdown).toContain("Evaluating a potential partnership");
    expect(markdown).toContain("March 9, 2026");
    expect(markdown).toContain("Expires 2 years from the Effective Date.");
    expect(markdown).toContain("Governing Law: Delaware");
    expect(markdown).toContain("Jurisdiction: New Castle, DE");
  });

  it("describes the confidentiality term on its own line", () => {
    const markdown = buildMarkdown(withValues({ confidentialityTerm: { kind: "perpetual" } }));
    expect(markdown).toContain("In perpetuity.");
  });

  it("writes None. when there are no modifications", () => {
    expect(buildMarkdown(withValues({ modifications: "" }))).toContain("### MNDA Modifications");
    expect(buildMarkdown(withValues({ modifications: "   " }))).toContain("None.");
  });

  it("writes the modifications when there are some", () => {
    const markdown = buildMarkdown(withValues({ modifications: "Clause 5 is deleted." }));
    expect(markdown).toContain("Clause 5 is deleted.");
    expect(markdown).not.toContain("None.");
  });

  it("shows unfilled values as bracketed placeholders", () => {
    const markdown = buildMarkdown(EMPTY);
    for (const field of ["[Purpose]", "[Effective Date]", "[Governing Law]", "[Jurisdiction]"]) {
      expect(markdown, field).toContain(field);
    }
  });

  it("does not escape the brackets of a placeholder", () => {
    // The brackets are the signal that something is outstanding; escaping them
    // would render as literal backslashes in the downloaded file.
    expect(buildMarkdown(EMPTY)).not.toContain("\\[Purpose\\]");
  });
});

describe("buildMarkdown - defined terms", () => {
  it("expands Purpose with its value exactly once", () => {
    const markdown = buildMarkdown(COMPLETE);
    expect(count(markdown, "Purpose (Evaluating a potential partnership)")).toBe(1);
  });

  it("refers to Purpose by name on later uses", () => {
    const markdown = buildMarkdown(COMPLETE);
    const standardTerms = markdown.slice(markdown.indexOf("# Standard Terms"));
    // More mentions of the term than expansions of it.
    expect(count(standardTerms, "Purpose")).toBeGreaterThan(
      count(standardTerms, "Purpose (Evaluating a potential partnership)"),
    );
  });

  it("never substitutes the bare value behind the definite article", () => {
    const markdown = buildMarkdown(COMPLETE);
    expect(markdown).not.toContain("the Evaluating a potential partnership");
  });

  it("expands the Effective Date as a defined term too", () => {
    const markdown = buildMarkdown(COMPLETE);
    const standardTerms = markdown.slice(markdown.indexOf("# Standard Terms"));
    expect(standardTerms).toContain("Effective Date (March 9, 2026)");
  });
});

describe("buildMarkdown - escaping", () => {
  it("escapes emphasis and code markers in a supplied value", () => {
    const markdown = buildMarkdown(withValues({ purpose: "Evaluate *synergy* and _scale_" }));
    expect(markdown).toContain("Evaluate \\*synergy\\* and \\_scale\\_");
  });

  it("escapes brackets and backslashes in a supplied value", () => {
    const markdown = buildMarkdown(withValues({ governingLaw: "Delaware [sic] \\ NY" }));
    expect(markdown).toContain("Delaware \\[sic\\] \\\\ NY");
  });

  it("escapes backticks so a value cannot open a code span", () => {
    const markdown = buildMarkdown(withValues({ jurisdiction: "New Castle `DE`" }));
    expect(markdown).toContain("New Castle \\`DE\\`");
  });

  it("does not let a value forge a markdown link", () => {
    const markdown = buildMarkdown(
      withValues({ purpose: "See [our terms](https://evil.test) for detail" }),
    );
    expect(markdown).not.toContain("[our terms](https://evil.test)");
    expect(markdown).toContain("\\[our terms\\]");
  });

  it("leaves the template's own markdown unescaped", () => {
    const markdown = buildMarkdown(COMPLETE);
    expect(markdown).toContain("**Introduction**");
    expect(markdown).toContain("[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)");
  });
});

describe("buildMarkdown - block escaping in modifications", () => {
  it("stops a line from becoming a bullet or a heading", () => {
    const modifications = ["- deleted", "+ added", "# heading", "> quoted"].join("\n");
    const markdown = buildMarkdown(withValues({ modifications }));
    expect(markdown).toContain("\\- deleted");
    expect(markdown).toContain("\\+ added");
    expect(markdown).toContain("\\# heading");
    expect(markdown).toContain("\\> quoted");
  });

  it("stops a line from becoming an ordered list item", () => {
    const markdown = buildMarkdown(withValues({ modifications: "1. first\n2. second" }));
    expect(markdown).toContain("1\\. first");
    expect(markdown).toContain("2\\. second");
  });

  it("escapes indented list markers too", () => {
    // The value is trimmed before escaping, so the indent has to be on a line
    // of its own to survive.
    const markdown = buildMarkdown(withValues({ modifications: "Amendments:\n  - indented" }));
    expect(markdown).toContain("  \\- indented");
  });

  it("keeps the line structure of a multi-line value", () => {
    const markdown = buildMarkdown(withValues({ modifications: "One\nTwo\nThree" }));
    expect(markdown).toContain("One\nTwo\nThree");
  });

  it("applies inline escaping inside the block as well", () => {
    const markdown = buildMarkdown(withValues({ modifications: "Delete *clause 5*" }));
    expect(markdown).toContain("Delete \\*clause 5\\*");
  });
});

describe("buildMarkdown - signature table cells", () => {
  it("escapes a pipe so it cannot break the row", () => {
    const markdown = buildMarkdown(
      withValues({ party1: { ...COMPLETE.party1, company: "Acme | Holdings" } }),
    );
    expect(markdown).toContain("Acme \\| Holdings");
  });

  it("flattens a multi-line notice address onto one row", () => {
    const markdown = buildMarkdown(
      withValues({
        party1: { ...COMPLETE.party1, noticeAddress: "1 Main St\nSpringfield, IL" },
      }),
    );
    expect(markdown).toContain("| Notice Address | 1 Main St Springfield, IL | legal@globex.com |");
  });

  it("flattens CRLF line endings too", () => {
    const markdown = buildMarkdown(
      withValues({ party1: { ...COMPLETE.party1, noticeAddress: "1 Main St\r\nSpringfield" } }),
    );
    expect(markdown).toContain("1 Main St Springfield");
    expect(markdown).not.toContain("\r");
  });

  it("renders empty party details as empty cells", () => {
    const markdown = buildMarkdown(EMPTY);
    expect(markdown).toContain("| Print Name |  |  |");
    expect(markdown).toContain("| Company |  |  |");
  });

  it("keeps every table row balanced at three columns", () => {
    const markdown = buildMarkdown(
      withValues({
        party1: { ...COMPLETE.party1, company: "A | B", noticeAddress: "x\ny" },
        party2: { ...COMPLETE.party2, name: "C | D" },
      }),
    );
    const rows = markdown.split("\n").filter((line) => line.startsWith("|"));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      // Unescaped pipes only: a balanced row has 4 of them.
      const pipes = row.replace(/\\\|/g, "").split("|").length - 1;
      expect(pipes, `row: ${row}`).toBe(4);
    }
  });
});

describe("buildFilename", () => {
  it("names the file after both companies", () => {
    expect(buildFilename(COMPLETE)).toBe("mutual-nda-acme-inc-globex-llc.md");
  });

  it("uses whichever company is supplied", () => {
    expect(
      buildFilename(withValues({ party2: { ...COMPLETE.party2, company: "" } })),
    ).toBe("mutual-nda-acme-inc.md");
    expect(
      buildFilename(withValues({ party1: { ...COMPLETE.party1, company: "" } })),
    ).toBe("mutual-nda-globex-llc.md");
  });

  it("falls back to a generic name when neither company is supplied", () => {
    expect(buildFilename(EMPTY)).toBe("mutual-nda.md");
  });

  it("trims punctuation to a clean slug", () => {
    expect(
      buildFilename(
        withValues({
          party1: { ...COMPLETE.party1, company: "  ***Acme & Co.***  " },
          party2: { ...COMPLETE.party2, company: "" },
        }),
      ),
    ).toBe("mutual-nda-acme-co.md");
  });

  it("drops a company that slugs to nothing", () => {
    expect(
      buildFilename(
        withValues({
          party1: { ...COMPLETE.party1, company: "!!!" },
          party2: { ...COMPLETE.party2, company: "Globex LLC" },
        }),
      ),
    ).toBe("mutual-nda-globex-llc.md");
  });

  it("produces a filesystem-safe name for any input", () => {
    const hostile = withValues({
      party1: { ...COMPLETE.party1, company: '../../etc/passwd' },
      party2: { ...COMPLETE.party2, company: 'a:b*c?d"e<f>g|h' },
    });
    expect(buildFilename(hostile)).toMatch(/^[a-z0-9.-]+\.md$/);
    expect(buildFilename(hostile)).not.toContain("..");
    expect(buildFilename(hostile)).not.toContain("/");
  });

  it("transliterates nothing, so a non-ASCII name slugs to its ASCII remnants", () => {
    // Documented limitation: the slug keeps only [a-z0-9]. A company name with
    // no ASCII letters at all falls back to the generic filename.
    expect(
      buildFilename(
        withValues({
          party1: { ...COMPLETE.party1, company: "株式会社" },
          party2: { ...COMPLETE.party2, company: "" },
        }),
      ),
    ).toBe("mutual-nda.md");
  });
});

describe("buildMarkdown - stability", () => {
  it("is deterministic", () => {
    expect(buildMarkdown(COMPLETE)).toBe(buildMarkdown(COMPLETE));
  });

  it("does not mutate the values it renders", () => {
    const values = withValues({});
    const snapshot = structuredClone(values);
    buildMarkdown(values);
    expect(values).toEqual(snapshot);
  });

  it("matches the approved full document", () => {
    expect(buildMarkdown(COMPLETE)).toMatchSnapshot();
  });

  it("matches the approved empty document", () => {
    expect(buildMarkdown(EMPTY)).toMatchSnapshot();
  });
});
