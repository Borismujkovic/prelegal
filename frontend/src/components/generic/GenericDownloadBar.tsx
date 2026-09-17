"use client";

/**
 * Taking the document away, keeping it, and saying what is still missing first.
 *
 * PDF is `window.print()` against the print stylesheet rather than a library:
 * the document on screen is already the document, so printing it is both
 * simpler and guaranteed to match. Markdown is built in the browser and handed
 * over as a Blob — neither route involves the server.
 *
 * Saving does, and it is the one action here that needs an account. The state
 * of a save is owned by the creator above, because the values are, and this bar
 * only reports it.
 */
import { DRAFT_REVIEW_NOTE } from "@/lib/disclaimer";
import type { SaveState } from "@/lib/drafts";
import { findMissingFields } from "@/lib/generic/field-values";
import { buildFilename, buildMarkdown } from "@/lib/generic/markdown-export";
import type { GeneratedDocument, GenericValues } from "@/lib/generic/types";
import { useState } from "react";

const BUTTON =
  "rounded-md px-3.5 py-2 text-sm font-medium transition focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 disabled:opacity-60";

export function GenericDownloadBar({
  document: agreement,
  values,
  onSave,
  saveState,
  isSaved,
}: {
  document: GeneratedDocument;
  values: GenericValues;
  onSave: () => void;
  saveState: SaveState;
  /** Whether this draft already exists on the server, which changes the verb. */
  isSaved: boolean;
}) {
  const [showMissing, setShowMissing] = useState(false);
  const missing = findMissingFields(agreement, values);

  function downloadMarkdown() {
    const blob = new Blob([buildMarkdown(agreement, values)], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = buildFilename(agreement, values);
    window.document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-brand-gray">
          {missing.length === 0 ? (
            <span className="font-medium text-navy">
              Everything required is filled in.
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setShowMissing((open) => !open)}
                className="font-medium text-navy underline underline-offset-2"
                aria-expanded={showMissing}
              >
                {missing.length} still to fill in
              </button>{" "}
              — you can download a draft anyway.
            </>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saveState.status === "saving"}
            className={`${BUTTON} border border-brand-purple text-brand-purple hover:bg-brand-purple/5 focus-visible:outline-brand-purple`}
          >
            {saveState.status === "saving"
              ? "Saving…"
              : isSaved
                ? "Save changes"
                : "Save draft"}
          </button>
          <button
            type="button"
            onClick={downloadMarkdown}
            className={`${BUTTON} border border-slate-300 text-navy hover:bg-slate-50 focus-visible:outline-brand-blue`}
          >
            Download .md
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className={`${BUTTON} bg-brand-purple text-white hover:opacity-90 focus-visible:outline-brand-purple`}
          >
            Download PDF
          </button>
        </div>
      </div>

      {showMissing && missing.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-brand-gray">
          {missing.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      ) : null}

      <SaveMessage state={saveState} />

      <p className="mt-3 text-xs text-brand-gray">{DRAFT_REVIEW_NOTE}</p>
    </div>
  );
}

/**
 * The outcome of the last save.
 *
 * A failure is `role="alert"` and a success is not: losing work is worth
 * interrupting a screen reader for, and saving it is not.
 */
function SaveMessage({ state }: { state: SaveState }) {
  if (state.status === "saved") {
    return (
      <p className="mt-3 text-xs font-medium text-emerald-700">
        Saved. You will find it under Saved drafts.
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p role="alert" className="mt-3 text-xs text-red-700">
        {state.message}
      </p>
    );
  }
  return null;
}
