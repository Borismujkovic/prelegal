/**
 * The chat wire module.
 *
 * What is pinned here is the contract with the backend: what a turn posts, and
 * that every way a turn can fail arrives as a message worth reading rather than
 * a raw status code.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { GREETING, sendChatTurn, type ChatMessage } from "@/lib/chat";
import { COMPLETE, EMPTY } from "./fixtures";

const ENDPOINT = "/api/documents/mutual-nda/chat";

const CONVERSATION: ChatMessage[] = [
  GREETING,
  { role: "user", content: "We are evaluating a partnership with Globex." },
];

function respondWith(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sending a turn", () => {
  it("posts the conversation and the cover page as it stands", async () => {
    const fetchMock = respondWith({ reply: "Noted.", patch: {} });

    await sendChatTurn(CONVERSATION, COMPLETE);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({
      messages: CONVERSATION,
      values: COMPLETE,
    });
  });

  it("returns the reply and the patch", async () => {
    respondWith({
      reply: "What date should it start?",
      patch: { purpose: "Evaluating a partnership" },
    });

    const turn = await sendChatTurn(CONVERSATION, EMPTY);

    expect(turn.reply).toBe("What date should it start?");
    expect(turn.patch).toEqual({ purpose: "Evaluating a partnership" });
  });

  it("carries a term through as a tagged union, ready to assign", async () => {
    respondWith({
      reply: "Done.",
      patch: {
        ndaTerm: { kind: "fixed", years: 3 },
        confidentialityTerm: { kind: "perpetual" },
      },
    });

    const turn = await sendChatTurn(CONVERSATION, EMPTY);

    expect(turn.patch.ndaTerm).toEqual({ kind: "fixed", years: 3 });
    expect(turn.patch.confidentialityTerm).toEqual({ kind: "perpetual" });
  });
});

describe("when a turn fails", () => {
  it("reports what the backend said, when it said something", async () => {
    respondWith({ detail: "The assistant is not configured on this server." }, {
      ok: false,
      status: 503,
    });

    await expect(sendChatTurn(CONVERSATION, EMPTY)).rejects.toThrow(
      "The assistant is not configured on this server.",
    );
  });

  it("falls back to a readable message when the body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error("not json");
        },
      }),
    );

    await expect(sendChatTurn(CONVERSATION, EMPTY)).rejects.toThrow(
      "The assistant is unavailable right now. Please try again.",
    );
  });

  it("explains a rejected turn rather than blaming the connection", async () => {
    // FastAPI reports a validation failure with `detail` as an array of field
    // errors. Read as a string it is empty, which used to fall through to the
    // connection message and tell the user the backend was down when it was not.
    respondWith(
      {
        detail: [
          {
            type: "too_long",
            loc: ["body", "messages"],
            msg: "List should have at most 60 items after validation, not 61",
          },
        ],
      },
      { ok: false, status: 422 },
    );

    await expect(sendChatTurn(CONVERSATION, EMPTY)).rejects.toThrow(
      /conversation has grown too long/,
    );
  });

  it("points a rejected turn at the manual form, since nothing is lost", async () => {
    respondWith({ detail: [] }, { ok: false, status: 422 });

    await expect(sendChatTurn(CONVERSATION, EMPTY)).rejects.toThrow(
      /Edit fields manually/,
    );
  });

  it("blames the connection when the status says nothing useful", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("not json");
        },
      }),
    );

    await expect(sendChatTurn(CONVERSATION, EMPTY)).rejects.toThrow(
      "Could not reach the server. Is the backend running?",
    );
  });
});

describe("the greeting", () => {
  it("comes from the assistant, so the transcript opens as a conversation", () => {
    expect(GREETING.role).toBe("assistant");
    expect(GREETING.content.length).toBeGreaterThan(0);
  });
});
