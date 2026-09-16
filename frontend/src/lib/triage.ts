/**
 * Asking which agreement you actually need.
 *
 * Stateless in the same way the drafting chats are: the browser holds the
 * conversation and resends it, and the server keeps nothing.
 *
 * `status` is computed by the backend from the catalog rather than claimed by
 * the model, so "can I draft this yet" has exactly one answer. It is a small
 * closed union, which is worth having as a union: the three cases want three
 * genuinely different things on screen, and a fourth should not compile until
 * it has been drawn.
 */
import { describeChatFailure } from "./describe-chat-failure";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type TriageStatus =
  | "available"
  | "not_yet_available"
  | "no_recommendation";

export type TriageTurn = {
  reply: string;
  recommendedDocumentId: string | null;
  status: TriageStatus;
};

export const MAX_MESSAGE_LENGTH = 4000;

export const TRIAGE_GREETING: ChatMessage = {
  role: "assistant",
  content:
    "Not sure which agreement you need? Describe the situation — who the " +
    "other side is, what you are exchanging, and whether anything is signed " +
    "already — and I'll point you at the right one.",
};

/** Nothing is being drafted here, so there is nothing to reassure them about. */
const TOO_LONG =
  "This conversation has grown too long. Start a new one to carry on.";

export async function sendTriageTurn(
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<TriageTurn> {
  const response = await fetch("/api/assistant/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!response.ok) {
    throw new Error(await describeChatFailure(response, TOO_LONG));
  }

  return (await response.json()) as TriageTurn;
}
