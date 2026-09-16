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
          Choose an agreement to draft.
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

      {!catalog && !error && <p className="text-sm text-brand-gray">Loading…</p>}

      {catalog && (
        <>
          <div className="mb-8">
            <TriageAssistant catalog={catalog.documents} />
          </div>

          <ul className="grid gap-4 sm:grid-cols-2">
            {catalog.documents.map((entry) => (
              <li key={entry.id}>
                <DocumentCard entry={entry} />
              </li>
            ))}
          </ul>

          <p className="mt-8 text-xs text-brand-gray">{catalog.attribution}</p>
        </>
      )}
    </div>
  );
}

function DocumentCard({ entry }: { entry: CatalogDocument }) {
  const card = (
    <>
      <div className="flex items-baseline gap-2">
        <h2 className="font-semibold text-navy">{entry.name}</h2>
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
