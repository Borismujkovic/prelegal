/**
 * The draft notice has to reach what the user takes away.
 *
 * On screen it is a component, and in the export it is markdown, and those are
 * two renderers over one piece of text — the same arrangement that already
 * needs `parity.test.tsx` to stop the document itself drifting. These tests
 * cover the half of it that does not need a DOM: that both markdown exports
 * carry the notice, and that the Common Paper attribution still comes last.
 *
 * That ordering is not cosmetic. `templates/README.md` requires the CC BY
 * credit to travel with anything generated from those templates, so the notice
 * is added before it and never in place of it.
 */
import { describe, expect, it } from "vitest";
import { DISCLAIMER_BODY, DISCLAIMER_HEADING } from "@/lib/disclaimer";
import { DOCUMENT_REGISTRY } from "@/lib/generated";
import { createDefaultValues } from "@/lib/generic/field-values";
import { buildMarkdown as buildGenericMarkdown } from "@/lib/generic/markdown-export";
import { buildMarkdown as buildNdaMarkdown } from "@/lib/markdown-export";
import { COMPLETE } from "./fixtures";

const documents = Object.values(DOCUMENT_REGISTRY);

describe("the Mutual NDA export", () => {
  const markdown = buildNdaMarkdown(COMPLETE);

  it("carries the draft notice", () => {
    expect(markdown).toContain(DISCLAIMER_HEADING);
    expect(markdown).toContain(DISCLAIMER_BODY);
  });

  it("still ends with the Common Paper attribution", () => {
    expect(markdown.indexOf(DISCLAIMER_HEADING)).toBeLessThan(
      markdown.lastIndexOf("Common Paper"),
    );
  });
});

describe.each(documents)("the $id export", (document) => {
  const markdown = buildGenericMarkdown(document, createDefaultValues(document));

  it("carries the draft notice", () => {
    expect(markdown).toContain(DISCLAIMER_HEADING);
    expect(markdown).toContain(DISCLAIMER_BODY);
  });

  it("still ends with the Common Paper attribution", () => {
    expect(markdown.indexOf(DISCLAIMER_HEADING)).toBeLessThan(
      markdown.indexOf(document.attribution),
    );
  });

  it("names Prelegal, so it cannot be read as part of the agreement", () => {
    expect(DISCLAIMER_HEADING).toMatch(/Prelegal/);
  });
});
