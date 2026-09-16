/**
 * The generic drafting chat: what crosses the wire, and how a turn is applied.
 *
 * Same contract as the Mutual NDA's `lib/chat.ts`. The backend keeps no
 * conversation state, so every turn posts the whole transcript along with the
 * values as they stand — which is what lets something typed into the manual
 * form reach the assistant without anyone having to mention it.
 *
 * A turn comes back as a patch: only what that message established. An absent
 * key means "unchanged", never "cleared", so it is safe to feed straight
 * through the same shallow merge the form uses.
 */
import { describeChatFailure } from "../describe-chat-failure";
import type { GeneratedDocument, GenericValues, Party } from "./types";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

/**
 * The values one turn established.
 *
 * Keys are the camelCase field ids from the document's overlay, so this cannot
 * be typed per document without generating a type per document. The backend is
 * where that strictness lives: it builds a schema naming exactly this
 * document's fields and forbids the rest, so anything arriving here has already
 * been checked against the document it belongs to.
 */
export type DocumentPatch = Record<string, unknown> & {
  party1?: Partial<Party>;
  party2?: Partial<Party>;
};

export type DocumentChatTurn = {
  reply: string;
  patch: DocumentPatch;
  needsFollowUp: boolean;
};

/**
 * Mirrors `ChatMessage.content` in the backend's models.py. Enforced on the
 * composer too, so an over-long message is stopped where the user can see it
 * rather than coming back as a validation error they cannot act on.
 */
export const MAX_MESSAGE_LENGTH = 4000;

/**
 * What the assistant opens with, before anyone has typed anything.
 *
 * Built here rather than fetched: the app is a static export and the API key
 * may not be configured at all, so a greeting that needed the network would
 * spinner or fail on every page load. It is sent back as the first message so
 * the model knows what the user has already been asked.
 */
export function greetingFor(document: GeneratedDocument): ChatMessage {
  return {
    role: "assistant",
    content:
      `Hi — I'll help you put this ${document.name} together. Tell me who the ` +
      `two sides are and what you have agreed so far, and I'll fill the ` +
      `document in as we go. If you're unsure about anything legal, ask and ` +
      `I'll tell you what's commonly done.`,
  };
}

/** The document survives a conversation that outgrew the cap; say so. */
const TOO_LONG =
  "This conversation has grown too long for the assistant to continue. " +
  "Nothing you have filled in is lost — you can finish the remaining " +
  "fields in “Edit fields manually” below.";

/** Sends one turn. Throws with a readable message on failure. */
export async function sendDocumentTurn(
  documentId: string,
  messages: ChatMessage[],
  values: GenericValues,
  signal?: AbortSignal,
): Promise<DocumentChatTurn> {
  const response = await fetch(`/api/documents/${documentId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, values }),
    signal,
  });

  if (!response.ok) {
    throw new Error(await describeChatFailure(response, TOO_LONG));
  }

  return (await response.json()) as DocumentChatTurn;
}

/**
 * Splits a patch into the two shapes the creator merges separately.
 *
 * Done here rather than in the component because it is the one place that has
 * to know the patch's keys are untyped: everything that is not a party is a
 * field value, and anything that is not a string is discarded rather than
 * trusted into the document.
 */
export function splitPatch(patch: DocumentPatch): {
  fields: Record<string, string>;
  party1?: Partial<Party>;
  party2?: Partial<Party>;
} {
  const fields: Record<string, string> = {};

  for (const [key, value] of Object.entries(patch)) {
    if (key === "party1" || key === "party2") continue;
    if (typeof value === "string") fields[key] = value;
  }

  return { fields, party1: patch.party1, party2: patch.party2 };
}
