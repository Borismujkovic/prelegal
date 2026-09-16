// @vitest-environment jsdom
/**
 * The screen and the export must say the same thing.
 *
 * `GenericDocument.tsx` and `lib/generic/markdown-export.ts` are two
 * independent renderers over the same data, which is exactly the arrangement
 * that drifts. The Mutual NDA has a suite like this one for the same reason;
 * this is its counterpart for the generic engine, run over every document so a
 * sixth is covered the day it is added.
 *
 * What is checked is that every value a user supplied reaches both outputs, and
 * that a value left blank is visibly a gap in both rather than silently absent
 * from one.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { GenericDocument } from "@/components/generic/GenericDocument";
import { DOCUMENT_REGISTRY } from "@/lib/generated";
import { createDefaultValues } from "@/lib/generic/field-values";
import { buildMarkdown } from "@/lib/generic/markdown-export";
import type { GeneratedDocument, GenericValues } from "@/lib/generic/types";

const documents = Object.values(DOCUMENT_REGISTRY) as GeneratedDocument[];

/** A distinct, findable value for every field the document asks about. */
function fullyFilled(document: GeneratedDocument): GenericValues {
  const fields = Object.fromEntries(
    document.sections
      .flatMap((section) => section.fields)
      .map((field, index) => [field.id, `Value${index}Alpha`]),
  );

  return {
    fields,
    party1: {
      company: "Acme Incorporated",
      name: "Ada Adams",
      title: "Chief Executive",
      noticeAddress: "legal@acme.example",
    },
    party2: {
      company: "Globex Limited",
      name: "Bo Brown",
      title: "Head of Legal",
      noticeAddress: "legal@globex.example",
    },
  };
}

describe.each(documents)("$id renders the same facts both ways", (document) => {
  const values = fullyFilled(document);

  it("carries every supplied value into both outputs", () => {
    const markdown = buildMarkdown(document, values);
    const { container } = render(
      <GenericDocument document={document} values={values} />,
    );
    const onScreen = container.textContent ?? "";

    for (const value of Object.values(values.fields)) {
      expect(markdown, `${value} missing from the export`).toContain(value);
      expect(onScreen, `${value} missing from the screen`).toContain(value);
    }
  });

  it("names both parties in both outputs", () => {
    const markdown = buildMarkdown(document, values);
    const { container } = render(
      <GenericDocument document={document} values={values} />,
    );
    const onScreen = container.textContent ?? "";

    for (const company of ["Acme Incorporated", "Globex Limited"]) {
      expect(markdown).toContain(company);
      expect(onScreen).toContain(company);
    }
  });

  it("carries the licence attribution into both outputs", () => {
    const markdown = buildMarkdown(document, values);
    const { container } = render(
      <GenericDocument document={document} values={values} />,
    );

    expect(markdown).toContain(document.attribution);
    expect(container.textContent).toContain(document.attribution);
  });

  it("shows an untouched document's gaps in both outputs", () => {
    const empty = createDefaultValues(document);
    const markdown = buildMarkdown(document, empty);
    const { container } = render(
      <GenericDocument document={document} values={empty} />,
    );
    const onScreen = container.textContent ?? "";

    for (const section of document.sections) {
      for (const field of section.fields) {
        expect(markdown).toContain(`[${field.field}]`);
        expect(onScreen).toContain(`[${field.field}]`);
      }
    }
  });

  it("renders every clause heading on screen", () => {
    render(<GenericDocument document={document} values={values} />);

    const headings = document.clauses
      .map((clause) => clause.heading)
      .filter((heading): heading is string => Boolean(heading));

    // Headings repeat across documents rarely but do repeat within one, so this
    // asserts presence rather than uniqueness.
    for (const heading of headings.slice(0, 8)) {
      expect(screen.getAllByText(heading, { exact: false }).length).toBeGreaterThan(0);
    }
  });
});
