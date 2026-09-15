// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MutualNdaPage from "@/app/documents/mutual-nda/page";

/** The rendered agreement, with whitespace collapsed. */
function documentText(): string {
  return (document.querySelector("article")?.textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("the Mutual NDA creator page", () => {
  it("shows the form and the document side by side", () => {
    render(<MutualNdaPage />);
    expect(screen.getByRole("region", { name: "Cover page details" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Agreement preview" })).toBeInTheDocument();
  });

  it("starts with every substitution outstanding", () => {
    render(<MutualNdaPage />);
    expect(documentText()).toContain("[Purpose]");
    expect(screen.getByRole("button", { name: /8 fields still to fill/ })).toBeInTheDocument();
  });

  it("fills the purpose into the document as it is typed", async () => {
    const user = userEvent.setup();
    render(<MutualNdaPage />);

    await user.type(screen.getByLabelText("Purpose"), "Evaluating a partnership");

    const text = documentText();
    expect(text).toContain("Evaluating a partnership");
    expect(text).not.toContain("[Purpose]");
  });

  it("fills the effective date into the document in long form", async () => {
    const user = userEvent.setup();
    render(<MutualNdaPage />);

    await user.type(screen.getByLabelText("Effective date"), "2026-03-09");

    const text = documentText();
    expect(text).toContain("March 9, 2026");
    expect(text).not.toContain("[Effective Date]");
  });

  it("reflects a change of term in the document", async () => {
    const user = userEvent.setup();
    render(<MutualNdaPage />);

    expect(documentText()).toContain("Expires 1 year from the Effective Date.");

    await user.click(screen.getByRole("radio", { name: /Continues until terminated/ }));
    const text = documentText();
    expect(text).toContain("Continues until terminated in accordance with the terms of the MNDA.");
    expect(text).not.toContain("Expires 1 year");
  });

  it("carries a party name into the signature block", async () => {
    const user = userEvent.setup();
    render(<MutualNdaPage />);

    await user.type(screen.getAllByLabelText("Print name")[0], "Jane Doe");
    expect(documentText()).toContain("Jane Doe");
  });

  it("counts down the outstanding fields as they are filled", async () => {
    const user = userEvent.setup();
    render(<MutualNdaPage />);

    await user.type(screen.getByLabelText("Purpose"), "Evaluating a deal");
    expect(screen.getByRole("button", { name: /7 fields still to fill/ })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Governing law"), "Delaware");
    expect(screen.getByRole("button", { name: /6 fields still to fill/ })).toBeInTheDocument();
  });

  it("reports readiness once the cover page is complete", async () => {
    const user = userEvent.setup();
    render(<MutualNdaPage />);

    await user.type(screen.getByLabelText("Purpose"), "Evaluating a deal");
    await user.type(screen.getByLabelText("Effective date"), "2026-03-09");
    await user.type(screen.getByLabelText("Governing law"), "Delaware");
    await user.type(screen.getByLabelText("Jurisdiction"), "New Castle, DE");
    await user.type(screen.getAllByLabelText("Print name")[0], "Jane Doe");
    await user.type(screen.getAllByLabelText("Company")[0], "Acme, Inc.");
    await user.type(screen.getAllByLabelText("Print name")[1], "John Roe");
    await user.type(screen.getAllByLabelText("Company")[1], "Globex LLC");

    expect(screen.getByText("Ready to download")).toBeInTheDocument();
  });

  it("keeps the two parties' edits apart", async () => {
    const user = userEvent.setup();
    render(<MutualNdaPage />);

    await user.type(screen.getAllByLabelText("Company")[0], "Acme");
    await user.type(screen.getAllByLabelText("Company")[1], "Globex");

    expect(screen.getAllByLabelText("Company")[0]).toHaveValue("Acme");
    expect(screen.getAllByLabelText("Company")[1]).toHaveValue("Globex");
  });

  // The page header moved to the shell layout; DocumentsLayout.test.tsx keeps
  // the print:hidden guarantee. What stays here is the page chrome it owns.
  it("hides the form and download bar from print", () => {
    const { container } = render(<MutualNdaPage />);
    const form = container.querySelector("section[aria-label=\"Cover page details\"]");
    expect(form?.className).toContain("print:hidden");
  });

  it("sends nothing anywhere - the form has no action", () => {
    const { container } = render(<MutualNdaPage />);
    const form = container.querySelector("form");
    expect(form?.getAttribute("action")).toBeNull();
    expect(form?.getAttribute("method")).toBeNull();
  });
});
