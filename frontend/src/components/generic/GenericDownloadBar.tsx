"use client";

/**
 * Taking the document away, and saying what is still missing before you do.
 *
 * PDF is `window.print()` against the print stylesheet rather than a library:
 * the document on screen is already the document, so printing it is both
 * simpler and guaranteed to match. Markdown is built in the browser and handed
 * over as a Blob — neither route involves the server.
 */
import { useState } from "react";
import { findMissingFields } from "@/lib/generic/field-values";
import { buildFilename, buildMarkdown } from "@/lib/generic/markdown-export";
import type { GeneratedDocument, GenericValues } from "@/lib/generic/types";

const BUTTON =
  "rounded-md px-3.5 py-2 text-sm font-medium focus-visible:outline-2 " +
  "focus-visible:outline-offset-2";

export function GenericDownloadBar({
  document: agreement,
  values,
}: {
  document: GeneratedDocument;
  values: GenericValues;
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
    <div className="rounded-lg border border-slate-200 bg-white p-4">
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
        <div className="flex gap-2">
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

      <p className="mt-3 text-xs text-brand-gray">
        This is a draft and should be reviewed by a lawyer before signing.
      </p>
    </div>
  );
}
