"use client";

/**
 * The conversation that fills in a document.
 *
 * Owns the transcript and the composer; it never touches the document's values
 * itself, it only reports what a turn established through `onPatch`. The
 * creator above merges that, so there is exactly one place where values change
 * however they were supplied — chat or form.
 *
 * The Mutual NDA has its own copy of this at `components/NdaChat.tsx`, in its
 * own slate and indigo. The two are deliberately separate: that one is shipping
 * and covered by its own suite, and merging them would mean rewriting it to
 * gain nothing a user could see. What they do share is the focus-restoration
 * hook, which is the part with behaviour worth getting right once.
 */
import { useEffect, useRef, useState } from "react";
import {
  MAX_MESSAGE_LENGTH,
  greetingFor,
  sendDocumentTurn,
  type ChatMessage,
  type DocumentPatch,
} from "@/lib/generic/document-chat";
import type { GeneratedDocument, GenericValues } from "@/lib/generic/types";
import { useChatFocusRestore } from "@/lib/generic/useChatFocusRestore";

const INPUT_CLASS =
  "w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-navy shadow-xs " +
  "placeholder:text-brand-gray focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 focus:outline-none " +
  "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-brand-gray";

function Bubble({ message }: { message: ChatMessage }) {
  const fromUser = message.role === "user";

  return (
    <div className={fromUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap " +
          (fromUser ? "bg-brand-purple text-white" : "bg-slate-100 text-navy")
        }
      >
        {message.content}
      </div>
    </div>
  );
}

/** Three dots that say the assistant is working, without faking progress. */
function Thinking() {
  return (
    <div className="flex justify-start">
      <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-brand-gray">
        <span className="sr-only">The assistant is thinking</span>
        <span aria-hidden className="inline-flex gap-1">
          <span className="size-1.5 animate-bounce rounded-full bg-brand-gray [animation-delay:-0.3s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-brand-gray [animation-delay:-0.15s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-brand-gray" />
        </span>
      </div>
    </div>
  );
}

export function DocumentChat({
  document: agreement,
  values,
  onPatch,
}: {
  document: GeneratedDocument;
  values: GenericValues;
  onPatch: (patch: DocumentPatch) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    greetingFor(agreement),
  ]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const { composerRef, textareaRef, captureFocusIntent } =
    useChatFocusRestore(sending);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [messages, sending]);

  /**
   * @param history The conversation to send. Passed in rather than read from
   * state so a retry resends the failed turn instead of appending it twice.
   */
  async function send(history: ChatMessage[]) {
    captureFocusIntent();
    setSending(true);
    setError(null);

    try {
      const turn = await sendDocumentTurn(agreement.id, history, values);
      setMessages([...history, { role: "assistant", content: turn.reply }]);
      onPatch(turn.patch);
    } catch (failure) {
      // The user's message stays in the transcript, so Retry needs no retyping.
      setMessages(history);
      setError(failure instanceof Error ? failure.message : "Something went wrong.");
    } finally {
      setSending(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;

    setDraft("");
    void send([...messages, { role: "user", content }]);
  }

  return (
    <section
      ref={composerRef}
      aria-label="Chat with the drafting assistant"
      className="flex h-[32rem] flex-col rounded-lg border border-slate-200 bg-white lg:h-[calc(100vh-16rem)]"
    >
      <div
        ref={transcriptRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="flex-1 space-y-3 overflow-y-auto p-4"
      >
        {messages.map((message, index) => (
          <Bubble key={index} message={message} />
        ))}
        {sending ? <Thinking /> : null}
      </div>

      {error ? (
        <div
          role="alert"
          className="mx-4 mb-3 rounded-md border border-brand-yellow bg-amber-50 px-3 py-2 text-sm text-navy"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void send(messages)}
            className="mt-1 font-medium underline underline-offset-2 hover:no-underline"
          >
            Try again
          </button>
        </div>
      ) : null}

      <form onSubmit={submit} className="border-t border-slate-200 p-3">
        <label htmlFor="chat-message" className="sr-only">
          Message the drafting assistant
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id="chat-message"
            ref={textareaRef}
            rows={2}
            // Matches the backend's own cap, so the limit is felt as the box
            // refusing more text rather than as a rejected request.
            maxLength={MAX_MESSAGE_LENGTH}
            className={INPUT_CLASS}
            value={draft}
            disabled={sending}
            placeholder={`Tell the assistant about your ${agreement.name.toLowerCase()}…`}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter starts a new line — what people expect
              // of a chat box, and what a bare textarea does not do by itself.
              if (event.key === "Enter" && !event.shiftKey) submit(event);
            }}
          />
          <button
            type="submit"
            disabled={sending || draft.trim() === ""}
            className={
              "shrink-0 rounded-md bg-brand-purple px-3.5 py-2 text-sm font-medium text-white " +
              "hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 " +
              "focus-visible:outline-brand-purple disabled:cursor-not-allowed disabled:bg-slate-300"
            }
          >
            Send
          </button>
        </div>
        <p className="mt-2 text-xs text-brand-gray">
          Suggestions reflect common practice, not legal advice.
        </p>
      </form>
    </section>
  );
}
