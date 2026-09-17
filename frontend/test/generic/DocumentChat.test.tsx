// @vitest-environment jsdom
/**
 * The generic chat pane, and the creator it reports into.
 *
 * The backend is never reached; `fetch` is stubbed throughout. What matters is
 * that a turn reaches the document exactly once, that a failure loses nothing
 * the user typed, and that a value set by the assistant is indistinguishable
 * from one typed into the form.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * The creator gained router hooks in PL-7: it reads `?draft=` to reopen a saved
 * draft and writes the id back after a save. Neither is what this suite is
 * about, so both are stubbed to "no draft in the URL".
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/documents/pilot-agreement",
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

import { DocumentChat } from "@/components/generic/DocumentChat";
import { DocumentCreator } from "@/components/generic/DocumentCreator";
import { DOCUMENT_REGISTRY } from "@/lib/generated";
import { createDefaultValues } from "@/lib/generic/field-values";

const pilot = DOCUMENT_REGISTRY["pilot-agreement"];

function respondWith(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function failWith(status: number, detail?: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: async () => (detail ? { detail } : {}),
    }),
  );
}

const composer = () => screen.getByLabelText("Message the drafting assistant");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the chat pane", () => {
  it("opens by naming the agreement being drafted", () => {
    render(
      <DocumentChat
        document={pilot}
        values={createDefaultValues(pilot)}
        onPatch={vi.fn()}
      />,
    );

    expect(screen.getByText(/Pilot Agreement/)).toBeInTheDocument();
  });

  it("posts to the endpoint for this document", async () => {
    const fetchMock = respondWith({ reply: "Noted.", patch: {}, needsFollowUp: false });
    const user = userEvent.setup();
    render(
      <DocumentChat
        document={pilot}
        values={createDefaultValues(pilot)}
        onPatch={vi.fn()}
      />,
    );

    await user.type(composer(), "Acme and Globex.{Enter}");

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/documents/pilot-agreement/chat",
        expect.anything(),
      ),
    );
  });

  it("sends the whole conversation, greeting included", async () => {
    const fetchMock = respondWith({ reply: "Noted.", patch: {}, needsFollowUp: false });
    const user = userEvent.setup();
    render(
      <DocumentChat
        document={pilot}
        values={createDefaultValues(pilot)}
        onPatch={vi.fn()}
      />,
    );

    await user.type(composer(), "Acme and Globex.{Enter}");

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.messages).toHaveLength(2);
    expect(sent.messages[0].role).toBe("assistant");
    expect(sent.messages[1].content).toBe("Acme and Globex.");
  });

  it("reports what the turn established exactly once", async () => {
    respondWith({
      reply: "Noted.",
      patch: { pilotPeriod: "90 days" },
      needsFollowUp: true,
    });
    const onPatch = vi.fn();
    const user = userEvent.setup();
    render(
      <DocumentChat
        document={pilot}
        values={createDefaultValues(pilot)}
        onPatch={onPatch}
      />,
    );

    await user.type(composer(), "Ninety days.{Enter}");

    await waitFor(() => expect(onPatch).toHaveBeenCalledTimes(1));
    expect(onPatch).toHaveBeenCalledWith({ pilotPeriod: "90 days" });
  });

  it("keeps the typed message in the transcript when a turn fails", async () => {
    failWith(502);
    const user = userEvent.setup();
    render(
      <DocumentChat
        document={pilot}
        values={createDefaultValues(pilot)}
        onPatch={vi.fn()}
      />,
    );

    await user.type(composer(), "Ninety days.{Enter}");

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText("Ninety days.")).toBeInTheDocument();
  });

  it("explains a server that has no API key configured", async () => {
    failWith(503, "The AI assistant is not configured on this server.");
    const user = userEvent.setup();
    render(
      <DocumentChat
        document={pilot}
        values={createDefaultValues(pilot)}
        onPatch={vi.fn()}
      />,
    );

    await user.type(composer(), "Hello.{Enter}");

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/not configured/),
    );
  });

  it("holds the composer shut while a turn is in flight", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise(() => {})));
    const user = userEvent.setup();
    render(
      <DocumentChat
        document={pilot}
        values={createDefaultValues(pilot)}
        onPatch={vi.fn()}
      />,
    );

    await user.type(composer(), "Hello.{Enter}");

    await waitFor(() => expect(composer()).toBeDisabled());
  });
});

describe("the creator", () => {
  it("writes what the assistant established into the document", async () => {
    respondWith({
      reply: "Noted.",
      patch: { pilotPeriod: "90 days from signing" },
      needsFollowUp: true,
    });
    const user = userEvent.setup();
    render(<DocumentCreator document={pilot} />);

    await user.type(composer(), "Ninety days.{Enter}");

    await waitFor(() =>
      expect(screen.getAllByText(/90 days from signing/).length).toBeGreaterThan(0),
    );
  });

  it("fills a party without disturbing the other", async () => {
    respondWith({
      reply: "Noted.",
      patch: { party1: { company: "Acme, Inc." } },
      needsFollowUp: true,
    });
    const user = userEvent.setup();
    render(<DocumentCreator document={pilot} />);

    await user.type(composer(), "We are Acme.{Enter}");

    await waitFor(() =>
      expect(screen.getAllByText(/Acme, Inc\./).length).toBeGreaterThan(0),
    );
    expect(screen.queryByText("Globex")).not.toBeInTheDocument();
  });

  it("ignores a patch value that is not text", async () => {
    // The backend's schema forbids this, so it should never arrive — but the
    // document is not the place to find out the schema was wrong.
    respondWith({
      reply: "Noted.",
      patch: { pilotPeriod: { nested: "object" } },
      needsFollowUp: true,
    });
    const user = userEvent.setup();
    render(<DocumentCreator document={pilot} />);

    await user.type(composer(), "Ninety days.{Enter}");

    await waitFor(() => expect(screen.getByText("Noted.")).toBeInTheDocument());
    expect(screen.getAllByText("[Pilot Period]").length).toBeGreaterThan(0);
  });

  it("counts the outstanding fields down as they are filled", async () => {
    respondWith({
      reply: "Noted.",
      patch: { party1: { company: "Acme, Inc." } },
      needsFollowUp: true,
    });
    const user = userEvent.setup();
    render(<DocumentCreator document={pilot} />);

    const before = screen.getByRole("button", { name: /still to fill in/ });
    const countBefore = Number(before.textContent?.match(/\d+/)?.[0]);

    await user.type(composer(), "We are Acme.{Enter}");

    await waitFor(() => {
      const after = screen.getByRole("button", { name: /still to fill in/ });
      expect(Number(after.textContent?.match(/\d+/)?.[0])).toBe(countBefore - 1);
    });
  });

  it("lets a value be typed in by hand instead", async () => {
    const user = userEvent.setup();
    render(<DocumentCreator document={pilot} />);

    await user.click(screen.getByText("Edit fields manually"));
    await user.type(screen.getByLabelText("Pilot period"), "60 days");

    await waitFor(() =>
      expect(screen.getAllByText(/60 days/).length).toBeGreaterThan(0),
    );
  });
});
