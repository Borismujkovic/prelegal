"use client";

/**
 * Saved drafts.
 *
 * A literal segment sitting beside `[documentId]`, exactly as
 * `documents/mutual-nda/` already does — a static segment out-ranks a dynamic
 * sibling, so `/documents/history` reaches this page and never the creator.
 * `test/components/HistoryPage.test.tsx` pins that no draftable document could
 * ever be given the id `history` and quietly take the route away.
 *
 * Opening a draft goes to its creator with `?draft=<id>` rather than to a
 * detail route of its own. A dynamic route would need `generateStaticParams`,
 * and a saved draft's id does not exist until a user creates one — there is
 * nothing to enumerate at build time.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/SessionProvider";
import { deleteDraft, listDrafts, type DraftSummary } from "@/lib/drafts";
import { UnauthorizedError } from "@/lib/session";

export default function HistoryPage() {
  const { expire } = useSession();
  const [drafts, setDrafts] = useState<DraftSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);

  const handleFailure = useCallback(
    (cause: unknown) => {
      if (cause instanceof Error && cause.name === "AbortError") return;
      if (cause instanceof UnauthorizedError) {
        // The database is recreated on every boot, so an ordinary restart ends
        // every session. Say so through the session rather than showing an
        // error here; the guard takes it from there.
        expire();
        return;
      }
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    },
    [expire],
  );

  useEffect(() => {
    const controller = new AbortController();
    listDrafts(controller.signal).then(setDrafts).catch(handleFailure);
    return () => controller.abort();
  }, [handleFailure]);

  async function remove(draft: DraftSummary) {
    if (!window.confirm(`Delete “${draft.title}”? This cannot be undone.`)) return;

    setRemoving(draft.id);
    setError(null);
    try {
      await deleteDraft(draft.id);
      setDrafts((current) =>
        (current ?? []).filter((entry) => entry.id !== draft.id),
      );
    } catch (cause) {
      handleFailure(cause);
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-navy">
          Saved drafts
        </h1>
        <p className="mt-1 text-sm text-brand-gray">
          Everything you have saved. Open one to carry on where you left off.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      {!drafts && !error && <p className="text-sm text-brand-gray">Loading…</p>}

      {drafts?.length === 0 && <EmptyState />}

      {drafts && drafts.length > 0 && (
        <ul className="space-y-3">
          {drafts.map((draft) => (
            <li
              key={draft.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-semibold text-navy">{draft.title}</h2>
                <p className="mt-1 text-xs text-brand-gray">
                  Last saved {formatSavedAt(draft.updated_at)}
                </p>
              </div>

              <Link
                href={`/documents/${draft.document_id}?draft=${draft.id}`}
                className="rounded-md border border-slate-300 px-3.5 py-2 text-sm font-medium text-navy transition hover:border-brand-blue focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:outline-none"
              >
                Open
              </Link>
              <button
                type="button"
                onClick={() => void remove(draft)}
                disabled={removing === draft.id}
                className="rounded-md px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:outline-none disabled:opacity-60"
              >
                {removing === draft.id ? "Deleting…" : "Delete"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white/50 p-10 text-center">
      <p className="font-medium text-navy">You have not saved a draft yet.</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-brand-gray">
        Start an agreement, then press Save draft to keep it here.
      </p>
      <Link
        href="/documents"
        className="mt-6 inline-block rounded-md bg-brand-purple px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Choose an agreement
      </Link>
    </div>
  );
}

/**
 * The server stores `datetime('now')`, which is UTC and has no timezone marker.
 * Parsing it as local time would shift it by the viewer's offset, so the `Z` is
 * put back before it reaches `Date`.
 */
function formatSavedAt(timestamp: string): string {
  const parsed = new Date(`${timestamp.replace(" ", "T")}Z`);
  if (Number.isNaN(parsed.getTime())) return timestamp;

  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
