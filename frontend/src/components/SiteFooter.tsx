/**
 * The footer, on the landing page and behind the sign-in alike.
 *
 * Carries the two things that should be visible from anywhere in the product:
 * that what it produces is a draft, and whose templates it is built on.
 * `print:hidden` because neither belongs in the PDF from here — the document
 * renders both itself, inside the page that gets printed.
 */
import { DRAFT_REVIEW_NOTE } from "@/lib/disclaimer";
import { ATTRIBUTION } from "@/lib/generated";

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white print:hidden">
      <div className="mx-auto flex max-w-[100rem] flex-col gap-1 px-6 py-6 text-xs text-brand-gray">
        <p>{DRAFT_REVIEW_NOTE} Prelegal does not provide legal advice.</p>
        <p>{ATTRIBUTION}</p>
      </div>
    </footer>
  );
}
