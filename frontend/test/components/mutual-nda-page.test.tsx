// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * The creator gained router hooks in PL-7: it reads `?draft=` to reopen a saved
 * draft and writes the id back after a save. Neither is what this suite is
 * about, so both are stubbed to "no draft in the URL".
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/documents/mutual-nda",
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * The creator reads the session for one reason only — to end it when the API
 * rejects a save. Stubbed rather than provided, so these tests stay about
 * drafting and never call /api/auth/me.
 *
 * Built once, outside the hook, rather than per call. `useDraftLoad` lists
 * `expire` among its dependencies — the real provider hands back a stable
 * `useCallback` — so a mock that minted a fresh function on every render would
 * change that dependency on every render and spin the effect forever.
 */
const session = {
  user: null,
  status: "signed-in" as const,
  setUser: vi.fn(),
  signOut: vi.fn(),
  expire: vi.fn(),
};
vi.mock("@/components/SessionProvider", () => ({ useSession: () => session }));

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

  // The cover page form still submits nowhere. The chat does reach the backend
  // now, but only through fetch - nothing here navigates or posts a form.
  it("never submits a form anywhere", () => {
    const { container } = render(<MutualNdaPage />);
    for (const form of container.querySelectorAll("form")) {
      expect(form.getAttribute("action")).toBeNull();
      expect(form.getAttribute("method")).toBeNull();
    }
  });
});

describe("the manual fields disclosure", () => {
  function disclosure(container: HTMLElement): HTMLDetailsElement | null {
    return container.querySelector("details");
  }

  it("starts closed, so the chat is what the page opens with", () => {
    const { container } = render(<MutualNdaPage />);

    expect(disclosure(container)?.open).toBe(false);
    expect(container.querySelector("details > summary")).toHaveTextContent(
      "Edit fields manually",
    );
  });

  it("opens to reveal the cover page form", async () => {
    const user = userEvent.setup();
    const { container } = render(<MutualNdaPage />);

    await user.click(screen.getByText("Edit fields manually"));

    expect(disclosure(container)?.open).toBe(true);
    expect(screen.getByLabelText("Purpose")).toBeInTheDocument();
  });
});

describe("drafting by chat", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function assistantReplies(reply: string, patch: unknown) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ reply, patch }),
      }),
    );
  }

  async function say(user: ReturnType<typeof userEvent.setup>, text: string) {
    await user.type(screen.getByLabelText("Message the drafting assistant"), text);
    await user.click(screen.getByRole("button", { name: "Send" }));
  }

  it("writes what the assistant established into the document", async () => {
    assistantReplies("Got it - what date should it start?", {
      purpose: "Evaluating a partnership",
      governingLaw: "Delaware",
    });
    const user = userEvent.setup();
    render(<MutualNdaPage />);

    await say(user, "We are evaluating a partnership, under Delaware law.");

    expect(
      await screen.findByText("Got it - what date should it start?"),
    ).toBeInTheDocument();
    const text = documentText();
    expect(text).toContain("Evaluating a partnership");
    expect(text).toContain("Delaware");
    expect(text).not.toContain("[Purpose]");
  });

  it("carries a term through as the tagged union the document reads", async () => {
    assistantReplies("Noted.", {
      ndaTerm: { kind: "untilTerminated" },
      confidentialityTerm: { kind: "perpetual" },
    });
    const user = userEvent.setup();
    render(<MutualNdaPage />);

    await say(user, "Run it until we terminate, confidentiality forever.");

    await screen.findByText("Noted.");
    const text = documentText();
    expect(text).toContain("Continues until terminated");
    expect(text).toContain("In perpetuity.");
  });

  it("fills a party without disturbing the other", async () => {
    assistantReplies("Thanks.", { party1: { company: "Acme, Inc." } });
    const user = userEvent.setup();
    render(<MutualNdaPage />);

    await say(user, "We are Acme.");

    await screen.findByText("Thanks.");
    expect(documentText()).toContain("Acme, Inc.");
    // Party 2 is untouched, and so is everything else on Party 1.
    await user.click(screen.getByText("Edit fields manually"));
    expect(screen.getAllByLabelText("Company")[0]).toHaveValue("Acme, Inc.");
    expect(screen.getAllByLabelText("Company")[1]).toHaveValue("");
    expect(screen.getAllByLabelText("Print name")[0]).toHaveValue("");
  });

  it("counts the answered fields down as the assistant fills them", async () => {
    assistantReplies("Done.", {
      purpose: "Evaluating a partnership",
      effectiveDate: "2026-03-09",
    });
    const user = userEvent.setup();
    render(<MutualNdaPage />);

    expect(screen.getByRole("button", { name: /8 fields still to fill/ })).toBeInTheDocument();

    await say(user, "A partnership, starting the 9th of March 2026.");

    await screen.findByText("Done.");
    expect(screen.getByRole("button", { name: /6 fields still to fill/ })).toBeInTheDocument();
  });

  it("leaves the document alone when a turn establishes nothing", async () => {
    assistantReplies("Governing law is the state whose rules apply. Delaware?", {});
    const user = userEvent.setup();
    render(<MutualNdaPage />);

    await say(user, "What does governing law mean?");

    await screen.findByText(/Governing law is the state/);
    expect(documentText()).toContain("[Purpose]");
    expect(screen.getByRole("button", { name: /8 fields still to fill/ })).toBeInTheDocument();
  });

  it("keeps a value typed into the form while a reply was in flight", async () => {
    assistantReplies("Noted.", { governingLaw: "Delaware" });
    const user = userEvent.setup();
    render(<MutualNdaPage />);

    await user.click(screen.getByText("Edit fields manually"));
    await user.type(screen.getByLabelText("Purpose"), "Evaluating a partnership");
    await say(user, "Delaware law please.");

    await screen.findByText("Noted.");
    const text = documentText();
    // The patch adds the governing law without clearing what was typed.
    expect(text).toContain("Delaware");
    expect(text).toContain("Evaluating a partnership");
  });
});
