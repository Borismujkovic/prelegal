/**
 * Titles the tab, and supplies the Suspense boundary the page needs.
 *
 * Two things the page cannot do for itself. It is a Client Component, and those
 * cannot export `metadata`; and it reads `?draft=` through `useSearchParams`,
 * which suspends on a prerendered route — `next build` fails with "Missing
 * Suspense boundary with useSearchParams" if nothing above it catches that.
 * Here is the nearest thing above it that is rendered on the server.
 */
import { Suspense } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mutual NDA · Prelegal",
  description:
    "Fill in a cover page and download a completed Common Paper Mutual Non-Disclosure Agreement.",
};

export default function MutualNdaLayout({
  children,
}: LayoutProps<"/documents/mutual-nda">) {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
      {children}
    </Suspense>
  );
}
