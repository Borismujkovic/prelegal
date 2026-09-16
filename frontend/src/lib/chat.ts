/**
 * The Mutual NDA chat: what crosses the wire, and how a turn is applied.
 *
 * The backend keeps no conversation state, so every turn posts the whole
 * transcript along with the Cover Page as it currently stands. That is what
 * lets a value the user typed into the manual form reach the assistant without
 * anyone having to mention it.
 *
 * A turn comes back as a *patch*: only what that message established. An absent
 * field means "unchanged", never "cleared", which is what makes it safe to feed
 * straight through the same shallow merge the form already uses.
 */
import { describeChatFailure } from "./describe-chat-failure";
import type { CoverPageValues, Party } from "./nda-fields";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

/**
 * The fields one turn changed. The two term fields keep their tagged-union
 * shape all the way from the model, so they arrive ready to assign — there is
 * no kind/years pair to reassemble on this side.
 */
export type CoverPagePatch = Partial<
  Pick<
    CoverPageValues,
    | "purpose"
    | "effectiveDate"
    | "ndaTerm"
    | "confidentialityTerm"
    | "governingLaw"
    | "jurisdiction"
    | "modifications"
  >
> & {
  party1?: Partial<Party>;
  party2?: Partial<Party>;
};

export type ChatTurn = {
  reply: string;
  patch: CoverPagePatch;
  /**
   * Whether the assistant still needs something. The backend uses it to
   * guarantee the reply ends on a question, so by the time it arrives here the
   * work is already done — it is carried for completeness, not acted on.
   */
  needsFollowUp: boolean;
};

/**
 * What the assistant opens with, before anyone has typed anything.
 *
 * Hardcoded rather than fetched. The app is a static export and the key may not
 * be configured at all, so a greeting that needed the network would spinner or
 * fail on every page load. It is sent back as the first message so the model
 * knows what the user has already been asked.
 */
export const GREETING: ChatMessage = {
  role: "assistant",
  content:
    "Hi — I'll help you put this Mutual NDA together. Tell me what the " +
    "agreement is for and who the two sides are, and I'll fill in the " +
    "document as we go. If you're unsure about anything legal, ask and I'll " +
    "tell you what's commonly done.",
};

/**
 * The longest single message the backend accepts, mirroring
 * `ChatMessage.content` in `backend/src/prelegal/models.py`. Enforced on the
 * composer as well, so an over-long message is stopped where the user can see
 * it rather than coming back as a validation error they cannot act on.
 */
export const MAX_MESSAGE_LENGTH = 4000;

/** The cover page survives a conversation that outgrew the cap; say so. */
const TOO_LONG =
  "This conversation has grown too long for the assistant to continue. " +
  "Nothing you have filled in is lost — you can finish the remaining " +
  "fields in “Edit fields manually” below.";

/** Sends one turn. Throws with a readable message on failure. */
export async function sendChatTurn(
  messages: ChatMessage[],
  values: CoverPageValues,
  signal?: AbortSignal,
): Promise<ChatTurn> {
  const response = await fetch("/api/documents/mutual-nda/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, values }),
    signal,
  });

  if (!response.ok) {
    throw new Error(await describeChatFailure(response, TOO_LONG));
  }

  return (await response.json()) as ChatTurn;
}
