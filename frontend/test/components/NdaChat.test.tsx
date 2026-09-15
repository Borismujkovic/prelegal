// @vitest-environment jsdom
/**
 * The chat pane.
 *
 * The backend is never reached; `fetch` is stubbed throughout. What matters
 * here is that a turn is reported upwards exactly once, that a failure loses
 * nothing the user typed, and that the pane cannot be made to send twice.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NdaChat } from "@/components/NdaChat";
import { GREETING } from "@/lib/chat";
import { EMPTY } from "../fixtures";

function renderChat(onPatch = vi.fn()) {
  render(<NdaChat values={EMPTY} onPatch={onPatch} />);
  return { onPatch, user: userEvent.setup() };
}

function respondWith(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function failWith(status: number, detail: string) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ detail }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function sendMessage(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(screen.getByLabelText("Message the drafting assistant"), text);
  await user.click(screen.getByRole("button", { name: "Send" }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the chat pane", () => {
  it("opens with a greeting and without touching the network", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderChat();

    expect(screen.getByText(GREETING.content)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says plainly that suggestions are not legal advice", () => {
    renderChat();
    expect(
      screen.getByText("Suggestions reflect common practice, not legal advice."),
    ).toBeInTheDocument();
  });

  it("shows the reply and reports what the turn established", async () => {
    respondWith({ reply: "Got it — what date?", patch: { purpose: "A partnership" } });
    const { onPatch, user } = renderChat();

    await sendMessage(user, "We are evaluating a partnership.");

    expect(await screen.findByText("Got it — what date?")).toBeInTheDocument();
    expect(screen.getByText("We are evaluating a partnership.")).toBeInTheDocument();
    expect(onPatch).toHaveBeenCalledExactlyOnceWith({ purpose: "A partnership" });
  });

  it("sends the whole conversation, greeting included", async () => {
    const fetchMock = respondWith({ reply: "Noted.", patch: {} });
    const { user } = renderChat();

    await sendMessage(user, "Acme and Globex.");

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toEqual([
      GREETING,
      { role: "user", content: "Acme and Globex." },
    ]);
    expect(body.values).toEqual(EMPTY);
  });

  it("will not send an empty message", async () => {
    const fetchMock = respondWith({ reply: "…", patch: {} });
    renderChat();

    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the message and offers a retry when the turn fails", async () => {
    failWith(502, "The assistant is unavailable right now.");
    const { onPatch, user } = renderChat();

    await sendMessage(user, "Acme and Globex.");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The assistant is unavailable right now.",
    );
    // Nothing the user typed is lost, and nothing was applied to the document.
    expect(screen.getByText("Acme and Globex.")).toBeInTheDocument();
    expect(onPatch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("resends the same turn on retry rather than repeating the message", async () => {
    failWith(502, "Unavailable.");
    const { user } = renderChat();
    await sendMessage(user, "Acme and Globex.");
    await screen.findByRole("alert");

    const retryFetch = respondWith({ reply: "Thanks.", patch: {} });
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Thanks.")).toBeInTheDocument();
    const body = JSON.parse(retryFetch.mock.calls[0][1].body);
    expect(body.messages.filter((m: { role: string }) => m.role === "user")).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("holds the composer shut while a turn is in flight", async () => {
    let release: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending));
    const { user } = renderChat();

    await sendMessage(user, "Acme and Globex.");

    expect(screen.getByLabelText("Message the drafting assistant")).toBeDisabled();
    expect(screen.getByText("The assistant is thinking")).toBeInTheDocument();

    release({ ok: true, status: 200, json: async () => ({ reply: "Hi.", patch: {} }) });
    expect(await screen.findByText("Hi.")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText("Message the drafting assistant")).toBeEnabled(),
    );
  });
});
