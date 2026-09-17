"use client";

/**
 * The dashboard: everything Prelegal can draft, from catalog.json.
 *
 * Six of the eleven are draftable. The remaining five are the large
 * multi-exhibit agreements — the Cloud Service Agreement and its relatives —
 * whose cover pages are still to be written (see cover-pages/README.md).
 * Listing them anyway is deliberate: it shows the shape of V1 rather than
 * pretending the product is narrower than it is going to be.
 *
 * The assistant above the grid is for people who do not know which of these
 * they need, which is most people the first time.
 *
 * The Common Paper attribution used to sit at the bottom of this page. It moved
 * to the shell's footer, where it is on every screen rather than on one.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { TriageAssistant } from "@/components/generic/TriageAssistant";
import { fetchCatalog, type Catalog, type CatalogDocument } from "@/lib/catalog";
import { useSession } from "@/components/SessionProvider";

export default function DocumentsPage() {
  const { user } = useSession();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchCatalog(controller.signal)
      .then(setCatalog)
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Something went wrong.");
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-navy">
          {user ? `Welcome, ${user.display_name}` : "Documents"}
        </h1>
        <p className="mt-1 text-sm text-brand-gray">
          Choose an agreement to draft, or describe your situation and let the
          assistant pick one.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      {!catalog && !error && <CardSkeletons />}

      {catalog && (
        <>
          <div className="mb-10">
            <TriageAssistant catalog={catalog.documents} />
          </div>

          <h2 className="mb-4 text-sm font-semibold tracking-[0.12em] text-brand-gray uppercase">
            All agreements
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {catalog.documents.map((entry) => (
              <li key={entry.id}>
                <DocumentCard entry={entry} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * Placeholder cards rather than the word "Loading".
 *
 * The grid is the shape of this page, and showing it immediately means the
 * layout does not jump when the catalog lands.
 */
function CardSkeletons() {
  return (
    <ul aria-hidden className="grid animate-pulse gap-4 sm:grid-cols-2">
      {Array.from({ length: 4 }, (_, index) => (
        <li
          key={index}
          className="h-40 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="h-4 w-1/3 rounded bg-slate-200" />
          <div className="mt-4 h-3 w-full rounded bg-slate-100" />
          <div className="mt-2 h-3 w-5/6 rounded bg-slate-100" />
          <div className="mt-6 h-3 w-1/2 rounded bg-slate-100" />
        </li>
      ))}
    </ul>
  );
}

function DocumentCard({ entry }: { entry: CatalogDocument }) {
  const card = (
    <>
      <div className="flex items-baseline gap-2">
        <h3 className="font-semibold text-navy">{entry.name}</h3>
        {entry.abbreviation && (
          <span className="text-xs tracking-wide text-brand-gray">
            {entry.abbreviation}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-slate-600">{entry.summary}</p>
      <p className="mt-3 text-xs text-brand-gray">{entry.use_when}</p>
    </>
  );

  if (!entry.available) {
    return (
      <div className="h-full rounded-lg border border-dashed border-slate-300 bg-white/50 p-5">
        {card}
        {/* Yellow tints the badge rather than colouring the text: #ecad0a is
            about 2:1 on white, which is not readable at this size. */}
        <p className="mt-4 inline-block rounded border border-brand-yellow/40 bg-brand-yellow/10 px-2 py-1 text-xs font-medium tracking-wide text-navy uppercase">
          Coming soon
        </p>
      </div>
    );
  }

  return (
    <Link
      href={`/documents/${entry.id}`}
      className="block h-full rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-blue hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:outline-none"
    >
      {card}
      <p className="mt-4 text-sm font-medium text-brand-purple">Draft this →</p>
    </Link>
  );
}
