/**
 * Turning a failed chat response into something worth showing a person.
 *
 * Shared by all three chats. The Mutual NDA and the generic engine are
 * deliberately separate implementations, but this is not part of what makes
 * them different — it is the same handful of HTTP statuses meaning the same
 * thing to the same user, and the triage assistant is not part of that split at
 * all. Three copies of one switch is three chances for the wording to drift.
 *
 * Only the 422 message differs, because only the caller knows what the user
 * stands to lose: a drafting chat can tell them their document is safe, and
 * triage has nothing to reassure them about.
 */

/** @param tooLong What to say when the conversation has outgrown the cap. */
export async function describeChatFailure(
  response: Response,
  tooLong: string,
): Promise<string> {
  // FastAPI answers a validation failure with `detail` as an array of field
  // errors rather than a string, so it never matches the check below. Those
  // errors name Pydantic internals; what a user can actually hit here is the
  // cap on conversation length.
  if (response.status === 422) return tooLong;

  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string" && body.detail) return body.detail;
  } catch {
    // Not JSON. Fall through to a message based on the status alone.
  }

  switch (response.status) {
    case 502:
      return "The assistant is unavailable right now. Please try again.";
    case 503:
      return "The assistant is not configured on this server yet.";
    default:
      return "Could not reach the server. Is the backend running?";
  }
}
