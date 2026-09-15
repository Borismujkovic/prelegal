"use client";

/**
 * The dashboard: everything Prelegal can draft, from catalog.json.
 *
 * Ten of the eleven are listed but not yet draftable — Common Paper publishes a
 * cover page for the Mutual NDA alone, and the cover page is what a user fills
 * in (see templates/README.md). Listing them anyway is deliberate: it shows the
 * shape of V1 rather than pretending the product is one document wide.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
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
        <p className="mt-4 text-xs font-medium tracking-wide text-brand-yellow uppercase">
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
