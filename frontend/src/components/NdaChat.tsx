"use client";

/**
 * The conversation that fills in the Cover Page.
 *
 * Owns the transcript and the composer; it never touches Cover Page values
 * itself, it only reports what a turn established through `onPatch`. The page
 * above merges that, so there is exactly one place where values change however
 * they were supplied — chat or form.
 */
import { useEffect, useRef, useState } from "react";
import {
  GREETING,
  MAX_MESSAGE_LENGTH,
  sendChatTurn,
  type ChatMessage,
  type CoverPagePatch,
} from "@/lib/chat";
import type { CoverPageValues } from "@/lib/nda-fields";

const INPUT_CLASS =
  "w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs " +
  "placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none " +
  "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

function Bubble({ message }: { message: ChatMessage }) {
  const fromUser = message.role === "user";

  return (
    <div className={fromUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap " +
          (fromUser
            ? "bg-indigo-600 text-white"
            : "bg-slate-100 text-slate-800")
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
      <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-500">
        <span className="sr-only">The assistant is thinking</span>
        <span aria-hidden className="inline-flex gap-1">
          <span className="size-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-slate-400" />
        </span>
      </div>
    </div>
  );
}

export function NdaChat({
  values,
  onPatch,
}: {
  values: CoverPageValues;
  onPatch: (patch: CoverPagePatch) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

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
    setSending(true);
    setError(null);

    try {
      const turn = await sendChatTurn(history, values);
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
          className="mx-4 mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
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
            rows={2}
            // Matches the backend's own cap, so the limit is felt as the box
            // refusing more text rather than as a rejected request.
            maxLength={MAX_MESSAGE_LENGTH}
            className={INPUT_CLASS}
            value={draft}
            disabled={sending}
            placeholder="Tell the assistant about your agreement…"
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
              "shrink-0 rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white " +
              "hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 " +
              "focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
            }
          >
            Send
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Suggestions reflect common practice, not legal advice.
        </p>
      </form>
    </section>
  );
}
