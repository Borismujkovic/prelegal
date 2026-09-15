"use client";

/**
 * Mutual NDA creator: the Cover Page form on the left, the live document on the
 * right. Everything runs in the browser — no values are sent anywhere.
 */
import { useCallback, useState } from "react";
import { CoverPageForm } from "@/components/CoverPageForm";
import { DownloadBar } from "@/components/DownloadBar";
import { NdaDocument } from "@/components/NdaDocument";
import {
  DEFAULT_VALUES,
  type CoverPageValues,
  type Party,
} from "@/lib/nda-fields";

export default function Home() {
  const [values, setValues] = useState<CoverPageValues>(DEFAULT_VALUES);

  const update = useCallback((patch: Partial<CoverPageValues>) => {
    setValues((current) => ({ ...current, ...patch }));
  }, []);

  const updateParty = useCallback(
    (party: "party1" | "party2", patch: Partial<Party>) => {
      setValues((current) => ({
        ...current,
        [party]: { ...current[party], ...patch },
      }));
    },
    [],
  );

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-[100rem] flex-wrap items-baseline gap-x-3 gap-y-1 px-6 py-4">
          <span className="text-sm font-semibold tracking-[0.18em] text-indigo-600 uppercase">
            Prelegal
          </span>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">
            Mutual NDA
          </h1>
          <p className="text-sm text-slate-500">
            Fill in the cover page, then download the completed agreement.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[100rem] flex-1 px-6 py-6 print:max-w-none print:p-0">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)] print:block">
          <section
            aria-label="Cover page details"
            className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pr-2 print:hidden"
          >
            <CoverPageForm
              values={values}
              onChange={update}
              onPartyChange={updateParty}
            />
          </section>

          <section aria-label="Agreement preview" className="min-w-0 print:block">
            <div className="mb-4 print:hidden">
              <DownloadBar values={values} />
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm sm:p-12 print:rounded-none print:border-0 print:p-0 print:shadow-none">
              <NdaDocument values={values} />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
