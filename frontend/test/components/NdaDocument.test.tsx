// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NdaDocument } from "@/components/NdaDocument";
import { COVER_PAGE_SECTIONS, STANDARD_TERMS } from "@/lib/nda-template.generated";
import { COMPLETE, EMPTY, withValues } from "../fixtures";

/** The document's text with whitespace collapsed, for prose assertions. */
function documentText(): string {
  const article = document.querySelector("article");
  return (article?.textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("NdaDocument - shape", () => {
  it("renders the agreement title as the top-level heading", () => {
    render(<NdaDocument values={COMPLETE} />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Mutual Non-Disclosure Agreement" }),
    ).toBeInTheDocument();
  });

  it("renders every Cover Page section heading", () => {
    render(<NdaDocument values={COMPLETE} />);
    for (const section of COVER_PAGE_SECTIONS) {
      expect(
        screen.getByRole("heading", { level: 3, name: section.title }),
        section.title,
      ).toBeInTheDocument();
    }
  });

  it("renders every Standard Terms clause", () => {
    render(<NdaDocument values={COMPLETE} />);
    const items = screen.getAllByRole("listitem");
    const clauseItems = items.filter((item) => /^\d+\./.test(item.textContent ?? ""));
    expect(clauseItems).toHaveLength(STANDARD_TERMS.length);

    for (const clause of STANDARD_TERMS) {
      expect(documentText(), `clause ${clause.number}`).toContain(clause.heading);
    }
  });

  it("keeps the CC BY 4.0 attribution with its licence link", () => {
    render(<NdaDocument values={COMPLETE} />);
    const links = screen.getAllByRole("link", { name: "CC BY 4.0" });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "https://creativecommons.org/licenses/by/4.0/");
    }
  });
});

describe("NdaDocument - filled values", () => {
  it("shows the supplied Cover Page values", () => {
    render(<NdaDocument values={COMPLETE} />);
    const text = documentText();
    expect(text).toContain("Evaluating a potential partnership");
    expect(text).toContain("March 9, 2026");
    expect(text).toContain("Expires 2 years from the Effective Date.");
    expect(text).toContain("Governing Law: Delaware");
    expect(text).toContain("Jurisdiction: New Castle, DE");
  });

  it("expands a defined term once and refers to it by name after", () => {
    render(<NdaDocument values={COMPLETE} />);
    const text = documentText();
    expect(text).toContain("Purpose (Evaluating a potential partnership)");
    expect(text.split("Purpose (Evaluating a potential partnership)")).toHaveLength(2);
  });

  it("never reads the value straight after the definite article", () => {
    render(<NdaDocument values={COMPLETE} />);
    expect(documentText()).not.toContain("the Evaluating a potential partnership");
  });

  it("renders the open-ended term choices", () => {
    render(
      <NdaDocument
        values={withValues({
          ndaTerm: { kind: "untilTerminated" },
          confidentialityTerm: { kind: "perpetual" },
        })}
      />,
    );
    const text = documentText();
    expect(text).toContain("Continues until terminated in accordance with the terms of the MNDA.");
    expect(text).toContain("In perpetuity.");
  });
});

describe("NdaDocument - outstanding values", () => {
  it("shows a bracketed placeholder for each unfilled field", () => {
    render(<NdaDocument values={EMPTY} />);
    const text = documentText();
    for (const field of ["[Purpose]", "[Effective Date]", "[Governing Law]", "[Jurisdiction]"]) {
      expect(text, field).toContain(field);
    }
  });

  it("still renders the full agreement so its shape is visible from the start", () => {
    render(<NdaDocument values={EMPTY} />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Mutual Non-Disclosure Agreement" }),
    ).toBeInTheDocument();
    expect(documentText()).toContain(STANDARD_TERMS[0].heading);
  });

  it("writes None. when there are no modifications", () => {
    render(<NdaDocument values={EMPTY} />);
    expect(documentText()).toContain("None.");
  });

  it("shows the modifications when there are some", () => {
    render(<NdaDocument values={withValues({ modifications: "Clause 5 is deleted." })} />);
    const text = documentText();
    expect(text).toContain("Clause 5 is deleted.");
    expect(text).not.toContain("None.");
  });

  it("renders user text as text, never as markup", () => {
    render(
      <NdaDocument values={withValues({ purpose: "<script>alert(1)</script> evaluation" })} />,
    );
    expect(document.querySelector("article script")).toBeNull();
    expect(documentText()).toContain("<script>alert(1)</script> evaluation");
  });
});

describe("NdaDocument - signature block", () => {
  it("labels both parties", () => {
    render(<NdaDocument values={COMPLETE} />);
    const text = documentText();
    expect(text).toContain("Party 1");
    expect(text).toContain("Party 2");
  });

  it("carries each party's details", () => {
    render(<NdaDocument values={COMPLETE} />);
    const text = documentText();
    expect(text).toContain("Jane Doe");
    expect(text).toContain("Chief Executive Officer");
    expect(text).toContain("Acme, Inc.");
    expect(text).toContain("legal@acme.com");
    expect(text).toContain("John Roe");
    expect(text).toContain("Globex LLC");
  });

  it("leaves Signature and Date as blank ruled lines", () => {
    render(<NdaDocument values={COMPLETE} />);
    const text = documentText();
    // The labels are present, but never carry a value — not even the Effective
    // Date, which is not necessarily the signing date.
    expect(text).toContain("Signature");
    expect(text).toContain("Date");
    expect(text).not.toContain("Date March 9, 2026");
  });

  it("shows a dash for a party detail left empty", () => {
    const { container } = render(
      <NdaDocument values={withValues({ party1: { ...COMPLETE.party1, title: "" } })} />,
    );
    expect(container.textContent).toContain("—");
  });
});

describe("NdaDocument - print behaviour", () => {
  it("hides the on-screen-only helper text from print", () => {
    const { container } = render(<NdaDocument values={COMPLETE} />);
    const hints = container.querySelectorAll(".print\\:hidden");
    expect(hints.length).toBeGreaterThan(0);
  });

  it("starts the Standard Terms on a fresh page", () => {
    const { container } = render(<NdaDocument values={COMPLETE} />);
    expect(container.querySelector(".break-before-page")).not.toBeNull();
  });

  it("keeps each signature block from splitting across pages", () => {
    const { container } = render(<NdaDocument values={COMPLETE} />);
    expect(container.querySelectorAll(".break-inside-avoid").length).toBeGreaterThan(0);
  });

  it("opens licence links in a new tab safely", () => {
    render(<NdaDocument values={COMPLETE} />);
    for (const link of screen.getAllByRole("link", { name: "CC BY 4.0" })) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
    }
  });
});

describe("NdaDocument - Governing Law section", () => {
  it("labels the two values separately", () => {
    render(<NdaDocument values={COMPLETE} />);
    const heading = screen.getByRole("heading", { level: 3, name: "Governing Law & Jurisdiction" });
    const section = heading.parentElement;
    expect(section).not.toBeNull();
    const text = within(section as HTMLElement).getByText(/Governing Law:/).parentElement;
    expect(text?.textContent).toContain("Delaware");
  });
});
