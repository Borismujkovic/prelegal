/**
 * The draft notice, as it appears inside a document.
 *
 * Shared by both document renderers so the Mutual NDA and the five generic
 * agreements cannot end up saying different things. Deliberately *not*
 * `print:hidden`: this is the one piece of Prelegal's own text that is meant to
 * reach the PDF.
 *
 * Styled to read as an aside rather than as a clause — boxed, sans-serif
 * against the document's serif, and headed with Prelegal's name — so nobody
 * mistakes it for something the parties agreed to.
 */
import { DISCLAIMER_BODY, DISCLAIMER_HEADING } from "@/lib/disclaimer";

export function DocumentDisclaimer() {
  return (
    <aside
      aria-label="Draft notice"
      className="mt-10 rounded-md border border-brand-yellow/50 bg-brand-yellow/10 px-4 py-3 font-sans break-inside-avoid print:border print:border-slate-400"
    >
      <p className="text-xs font-semibold tracking-wide text-navy uppercase">
        {DISCLAIMER_HEADING}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-slate-700">
        {DISCLAIMER_BODY}
      </p>
    </aside>
  );
}
