"use client";

/**
 * Puts the cursor back in the message box once the assistant has replied.
 *
 * Without this, answering a question costs a click. The composer is disabled
 * while a turn is in flight, and disabling the element the user is typing in
 * makes the browser drop focus to the body — so the reply arrives, the box
 * comes back, and the cursor is nowhere.
 *
 * Two conditions, both necessary:
 *
 * The user has to have been in the chat when they sent. `captureFocusIntent` is
 * called at the top of submit, before any state changes, while the browser
 * still has focus on whatever triggered it — the textarea for Enter, the Send
 * button for a click, both inside the composer.
 *
 * And they have to still be somewhere it is safe to take focus from. Intent
 * alone is not enough: someone who sends a message and then clicks into the
 * manual form while waiting has moved on, and yanking the cursor out from under
 * them mid-edit would be worse than the problem this fixes. So at the moment of
 * restoring, focus must be either back inside the composer or nowhere at all —
 * the body, which is exactly where disabling the textarea left it.
 */
import { useEffect, useRef } from "react";

export function useChatFocusRestore(sending: boolean) {
  const composerRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const shouldRefocus = useRef(false);
  const wasSending = useRef(sending);

  /** Call at the top of submit, and of any retry. */
  function captureFocusIntent() {
    const active = document.activeElement;
    shouldRefocus.current =
      active !== null && composerRef.current?.contains(active) === true;
  }

  useEffect(() => {
    const justFinished = wasSending.current && !sending;
    wasSending.current = sending;
    if (!justFinished || !shouldRefocus.current) return;

    shouldRefocus.current = false;

    // `document.body` is where focus goes when the element holding it is
    // disabled; anything else means the user chose to be somewhere.
    const active = document.activeElement;
    const adrift = active === null || active === document.body;
    const stillHere = composerRef.current?.contains(active) === true;
    if (adrift || stillHere) textareaRef.current?.focus();
  }, [sending]);

  return { composerRef, textareaRef, captureFocusIntent };
}
