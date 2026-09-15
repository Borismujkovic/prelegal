// @vitest-environment jsdom
/**
 * The dashboard.
 *
 * The distinction it has to get right: a document that can be drafted is a
 * link, one that cannot is not. Rendering a dead link for the ten documents
 * without a cover page would promise something the product cannot do.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
}));

import DocumentsPage from "@/app/documents/page";
import { SessionProvider } from "@/components/SessionProvider";

const ADA = {
  id: 1,
  email: "ada@example.com",
  display_name: "Ada Lovelace",
  created_at: "2026-09-15 12:00:00",
};

const CATALOG = {
  version: 1,
  attribution: "Agreement templates © Common Paper, licensed under CC BY 4.0.",
  documents: [
    {
      id: "mutual-nda",
      name: "Mutual NDA",
      abbreviation: "NDA",
      summary: "Both sides share confidential information.",
      use_when: "Before any commercial agreement exists.",
      standard_terms: "templates/mutual-nda.md",
      cover_page: "templates/mutual-nda-cover-page.md",
      attaches_to: null,
      available: true,
    },
    {
      id: "pilot-agreement",
      name: "Pilot Agreement",
      abbreviation: null,
      summary: "A time-boxed paid trial.",
      use_when: "A prospect wants to prove the product works.",
      standard_terms: "templates/pilot-agreement.md",
      cover_page: null,
      attaches_to: null,
      available: false,
    },
  ],
};

function renderDashboard() {
  return render(
    <SessionProvider>
      <DocumentsPage />
    </SessionProvider>,
  );
}

beforeEach(() => {
  window.localStorage.setItem("prelegal.user", JSON.stringify(ADA));
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => CATALOG }),
  );
});

describe("the documents dashboard", () => {
  it("lists every document in the catalog", async () => {
    renderDashboard();

    expect(await screen.findByText("Mutual NDA")).toBeInTheDocument();
    expect(screen.getByText("Pilot Agreement")).toBeInTheDocument();
  });

  it("links an available document to its creator", async () => {
    renderDashboard();

    const link = await screen.findByRole("link", { name: /Mutual NDA/ });
    expect(link).toHaveAttribute("href", "/documents/mutual-nda");
  });

  it("does not link a document that cannot be drafted yet", async () => {
    renderDashboard();

    await screen.findByText("Pilot Agreement");
    expect(screen.queryByRole("link", { name: /Pilot Agreement/ })).toBeNull();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
  });

  it("greets the signed-in user", async () => {
    renderDashboard();

    expect(await screen.findByText(/Welcome, Ada Lovelace/)).toBeInTheDocument();
  });

  it("keeps the Common Paper attribution on screen", async () => {
    renderDashboard();

    expect(await screen.findByText(/Common Paper/)).toBeInTheDocument();
  });

  it("reports a catalog it cannot load", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    renderDashboard();

    expect(await screen.findByRole("alert")).toHaveTextContent(/Could not load/);
  });
});
