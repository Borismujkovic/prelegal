"use client";

/**
 * Document actions. "Download PDF" goes through the browser's print dialog —
 * `globals.css` reduces the page to the document under `@media print`, which
 * gives correctly paginated output without a PDF library.
 */
import { useState } from "react";
import { buildFilename, buildMarkdown } from "@/lib/markdown-export";
import { findMissingFields, type CoverPageValues } from "@/lib/nda-fields";

const BUTTON_BASE =
  "inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500";

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

export function DownloadBar({ values }: { values: CoverPageValues }) {
  const [showMissing, setShowMissing] = useState(false);
  const missing = findMissingFields(values);
  const isComplete = missing.length === 0;

  return (
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

      <div className="flex gap-2">
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
  );
}
