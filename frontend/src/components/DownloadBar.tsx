"use client";

/**
 * Document actions. "Download PDF" goes through the browser's print dialog —
 * `globals.css` reduces the page to the document under `@media print`, which
 * gives correctly paginated output without a PDF library.
 *
 * Keeps its own slate/indigo styling rather than the brand palette, as the rest
 * of this creator does; see CLAUDE.md. The draft notice below is new, and was
 * missing here while the generic creator had carried one since PL-6 — five of
 * six documents warned you and the most-used one did not.
 */
import { useState } from "react";
import { DRAFT_REVIEW_NOTE } from "@/lib/disclaimer";
import type { SaveState } from "@/lib/drafts";
import { buildFilename, buildMarkdown } from "@/lib/markdown-export";
import { findMissingFields, type CoverPageValues } from "@/lib/nda-fields";

const BUTTON_BASE =
  "inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 " +
  "disabled:opacity-60";

function downloadMarkdown(values: CoverPageValues) {
  const blob = new Blob([buildMarkdown(values)], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = buildFilename(values);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function DownloadBar({
  values,
  onSave,
  saveState,
  isSaved,
}: {
  values: CoverPageValues;
  onSave: () => void;
  saveState: SaveState;
  /** Whether this draft already exists on the server, which changes the verb. */
  isSaved: boolean;
}) {
  const [showMissing, setShowMissing] = useState(false);
  const missing = findMissingFields(values);
  const isComplete = missing.length === 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          {isComplete ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-700">
              <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />
              Ready to download
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setShowMissing((open) => !open)}
              aria-expanded={showMissing}
              className="inline-flex items-center gap-1.5 text-amber-700 underline-offset-2 hover:underline"
            >
              <span aria-hidden className="size-1.5 rounded-full bg-amber-500" />
              {missing.length} field{missing.length === 1 ? "" : "s"} still to fill
            </button>
          )}
          {showMissing && !isComplete ? (
            <ul className="mt-2 list-inside list-disc text-xs text-slate-600">
              {missing.map((field) => (
                <li key={field}>{field}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saveState.status === "saving"}
            className={`${BUTTON_BASE} border border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50`}
          >
            {saveState.status === "saving"
              ? "Saving…"
              : isSaved
                ? "Save changes"
                : "Save draft"}
          </button>
          <button
            type="button"
            onClick={() => downloadMarkdown(values)}
            className={`${BUTTON_BASE} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
          >
            Download .md
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className={`${BUTTON_BASE} bg-indigo-600 text-white hover:bg-indigo-500`}
          >
            Download PDF
          </button>
        </div>
      </div>

      {saveState.status === "saved" ? (
        <p className="mt-3 text-xs font-medium text-emerald-700">
          Saved. You will find it under Saved drafts.
        </p>
      ) : null}
      {saveState.status === "error" ? (
        <p role="alert" className="mt-3 text-xs text-red-700">
          {saveState.message}
        </p>
      ) : null}

      <p className="mt-3 text-xs text-slate-500">{DRAFT_REVIEW_NOTE}</p>
    </div>
  );
}
