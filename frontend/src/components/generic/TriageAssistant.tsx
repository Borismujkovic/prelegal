"use client";

/**
 * "I don't know which of these I need."
 *
 * People arrive knowing their situation, not the name of the contract that
 * covers it — and sometimes what they want is not something Prelegal draws at
 * all. This handles both: it recommends the agreement that fits, and when the
 * honest answer is that we do not generate that kind of document, it says so
 * and still points somewhere useful.
 *
 * The recommendation arrives as an id plus a server-computed status, never as
 * prose to be parsed, so the card below can only ever link to a document that
 * exists and is genuinely ready.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useChatFocusRestore } from "@/lib/generic/useChatFocusRestore";
import { draftingRouteFor, type CatalogDocument } from "@/lib/catalog";
import {
  MAX_MESSAGE_LENGTH,
  TRIAGE_GREETING,
  sendTriageTurn,
  type ChatMessage,
  type TriageTurn,
} from "@/lib/triage";

type Entry = { message: ChatMessage; turn?: TriageTurn };

function Recommendation({
  turn,
  catalog,
}: {
  turn: TriageTurn;
  catalog: CatalogDocument[];
}) {
  const entry = catalog.find((item) => item.id === turn.recommendedDocumentId);

  switch (turn.status) {
    case "available": {
      const href = entry && draftingRouteFor(entry);
      // The status comes from the catalog, and so does the route, so the two
      // cannot disagree about whether this document can be opened.
      if (!entry || !href) return null;
      return (
        <Link
          href={href}
          className="mt-2 block rounded-lg border border-brand-blue bg-white p-3 transition hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
        >
          <p className="text-sm font-semibold text-navy">{entry.name}</p>
          <p className="mt-1 text-xs text-brand-gray">{entry.summary}</p>
          <p className="mt-2 text-sm font-medium text-brand-purple">
            Start drafting →
          </p>
        </Link>
      );
    }

    case "not_yet_available":
      if (!entry) return null;
      return (
        <div className="mt-2 rounded-lg border border-dashed border-slate-300 bg-white p-3">
          <p className="text-sm font-semibold text-navy">{entry.name}</p>
          <p className="mt-1 text-xs text-brand-gray">{entry.summary}</p>
          {/*
            Brand yellow is #ecad0a, which is about 2:1 on white — fine as a
            tint behind text, not readable as text. Same treatment the login
            screen's notice already uses.
          */}
          <p className="mt-2 inline-block rounded border border-brand-yellow/40 bg-brand-yellow/10 px-2 py-1 text-xs font-medium text-navy">
            Coming soon — not draftable yet
          </p>
        </div>
      );

    case "no_recommendation":
      // The reply already explains why; a card here would only add noise.
      return null;

    default: {
      const unhandled: never = turn.status;
      throw new Error(`Unhandled triage status: ${String(unhandled)}`);
    }
  }
}

export function TriageAssistant({ catalog }: { catalog: CatalogDocument[] }) {
  const [entries, setEntries] = useState<Entry[]>([
    { message: TRIAGE_GREETING },
  ]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const { composerRef, textareaRef, captureFocusIntent } =
    useChatFocusRestore(sending);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [entries, sending]);

  async function send(history: Entry[]) {
    captureFocusIntent();
    setSending(true);
    setError(null);

    try {
      const turn = await sendTriageTurn(history.map((entry) => entry.message));
      setEntries([
        ...history,
        { message: { role: "assistant", content: turn.reply }, turn },
      ]);
    } catch (failure) {
      setEntries(history);
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
    void send([...entries, { message: { role: "user", content } }]);
  }

  return (
    <section
      ref={composerRef}
      aria-label="Which agreement do I need?"
      className="rounded-lg border border-slate-200 bg-slate-50 p-4"
    >
      <h2 className="text-sm font-semibold text-navy">
        Not sure which one you need?
      </h2>

      <div
        ref={transcriptRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="mt-3 max-h-64 space-y-3 overflow-y-auto"
      >
        {entries.map((entry, index) => (
          <div
            key={index}
            className={
              entry.message.role === "user" ? "flex justify-end" : "flex justify-start"
            }
          >
            <div className="max-w-[85%]">
              <div
                className={
                  "rounded-lg px-3 py-2 text-sm whitespace-pre-wrap " +
                  (entry.message.role === "user"
                    ? "bg-brand-purple text-white"
                    : "bg-white text-navy")
                }
              >
                {entry.message.content}
              </div>
              {entry.turn ? (
                <Recommendation turn={entry.turn} catalog={catalog} />
              ) : null}
            </div>
          </div>
        ))}
        {sending ? (
          <p className="text-sm text-brand-gray">Thinking…</p>
        ) : null}
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-3 rounded-md border border-brand-yellow bg-amber-50 px-3 py-2 text-sm text-navy"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void send(entries)}
            className="mt-1 font-medium underline underline-offset-2 hover:no-underline"
          >
            Try again
          </button>
        </div>
      ) : null}

      <form onSubmit={submit} className="mt-3 flex items-end gap-2">
        <label htmlFor="triage-message" className="sr-only">
          Describe what you need
        </label>
        <textarea
          id="triage-message"
          ref={textareaRef}
          rows={2}
          maxLength={MAX_MESSAGE_LENGTH}
          className="w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-navy shadow-xs placeholder:text-brand-gray focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
          value={draft}
          disabled={sending}
          placeholder="We're about to start talks with a company that wants to resell our product…"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) submit(event);
          }}
        />
        <button
          type="submit"
          disabled={sending || draft.trim() === ""}
          className="shrink-0 rounded-md bg-brand-purple px-3.5 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Ask
        </button>
      </form>
    </section>
  );
}
