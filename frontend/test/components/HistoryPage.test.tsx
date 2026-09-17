// @vitest-environment jsdom
/**
 * Saved drafts.
 *
 * Three things matter. Opening a draft has to land on the creator for the right
 * document with `?draft=` attached, or the user gets a blank form and thinks
 * their work is gone. A 401 has to end the session rather than render an error,
 * because the database is recreated on every boot and an ordinary restart puts
 * every signed-in user into exactly that state. And the route itself has to
 * keep belonging to this page rather than to `[documentId]`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/documents/history",
}));

import HistoryPage from "@/app/documents/history/page";
import { SessionProvider } from "@/components/SessionProvider";
import { DRAFTABLE_DOCUMENT_IDS } from "@/lib/generated";
import { signedIn, stubApi } from "../api-mock";

const PILOT = {
  id: 7,
  document_id: "pilot-agreement",
  title: "Pilot Agreement — Acme & Globex",
  created_at: "2026-09-16 10:00:00",
  updated_at: "2026-09-17 09:30:00",
};

const NDA = {
  id: 8,
  document_id: "mutual-nda",
  title: "Mutual NDA — Acme",
  created_at: "2026-09-16 11:00:00",
  updated_at: "2026-09-16 11:00:00",
};

function renderHistory() {
  return render(
    <SessionProvider>
      <HistoryPage />
    </SessionProvider>,
  );
}

beforeEach(() => {
  stubApi({ ...signedIn(), "GET /api/drafts": { json: [PILOT, NDA] } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the saved drafts page", () => {
  it("lists what has been saved", async () => {
    renderHistory();

    expect(await screen.findByText(PILOT.title)).toBeInTheDocument();
    expect(screen.getByText(NDA.title)).toBeInTheDocument();
  });

  it("opens a draft in the creator it belongs to", async () => {
    renderHistory();

    await screen.findByText(PILOT.title);
    const [pilot, nda] = screen.getAllByRole("link", { name: "Open" });

    expect(pilot).toHaveAttribute("href", "/documents/pilot-agreement?draft=7");
    expect(nda).toHaveAttribute("href", "/documents/mutual-nda?draft=8");
  });

  it("says so plainly when there is nothing saved yet", async () => {
    stubApi({ ...signedIn(), "GET /api/drafts": { json: [] } });
    renderHistory();

    expect(await screen.findByText(/not saved a draft yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Choose an agreement/ })).toHaveAttribute(
      "href",
      "/documents",
    );
  });

  it("deletes a draft once, after asking", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = stubApi({
      ...signedIn(),
      "GET /api/drafts": { json: [PILOT, NDA] },
      "DELETE /api/drafts/7": { status: 204 },
    });
    const user = userEvent.setup();
    renderHistory();

    await screen.findByText(PILOT.title);
    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);

    await waitFor(() => expect(screen.queryByText(PILOT.title)).toBeNull());
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByText(NDA.title)).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([url]) => url === "/api/drafts/7"),
    ).toHaveLength(1);
  });

  it("keeps the draft when the confirmation is declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = stubApi({
      ...signedIn(),
      "GET /api/drafts": { json: [PILOT, NDA] },
    });
    const user = userEvent.setup();
    renderHistory();

    await screen.findByText(PILOT.title);
    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);

    expect(screen.getByText(PILOT.title)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/drafts/7")).toBe(false);
  });

  it("reports a list it could not load", async () => {
    stubApi({ ...signedIn(), "GET /api/drafts": { status: 500 } });
    renderHistory();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("treats a rejected session as being signed out, not as an error", async () => {
    // A restart wipes the database, so every cookie in existence stops
    // resolving. That is a sign-out, and showing "something went wrong" instead
    // would leave the user with no way to understand it.
    stubApi({
      ...signedIn(),
      "GET /api/drafts": { status: 401, json: { detail: "no" } },
    });
    renderHistory();

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.queryByText(PILOT.title)).toBeNull();
  });
});

describe("the /documents/history route", () => {
  it("cannot be taken over by a document of the same name", () => {
    // `history` is a literal segment beside `[documentId]`, and a literal wins.
    // It would stop winning if a document were ever given the id "history" —
    // the route would still resolve here, and that document would become
    // undraftable with no error anywhere.
    expect(DRAFTABLE_DOCUMENT_IDS).not.toContain("history");
  });
});
