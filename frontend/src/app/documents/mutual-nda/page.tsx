"use client";

/**
 * Mutual NDA creator: a conversation with the drafting assistant on the left,
 * the live document on the right. The Cover Page form is still here, tucked
 * into a disclosure under the chat, for anyone who would rather type a value
 * than say it — or who needs to correct one the assistant misheard.
 *
 * Values only ever leave the browser to be sent to our own backend, which holds
 * no conversation state and stores nothing.
 *
 * The page header lives in the surrounding shell (`../layout.tsx`), which is
 * also what marks it `print:hidden` so it stays out of the generated PDF.
 */
import { useCallback, useState } from "react";
import { CoverPageForm } from "@/components/CoverPageForm";
import { DownloadBar } from "@/components/DownloadBar";
import { NdaChat } from "@/components/NdaChat";
import { NdaDocument } from "@/components/NdaDocument";
import type { CoverPagePatch } from "@/lib/chat";
import {
  DEFAULT_VALUES,
  type CoverPageValues,
  type Party,
} from "@/lib/nda-fields";

export default function MutualNdaPage() {
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

  /**
   * Fold what a chat turn established into the document.
   *
   * Routed through the same two updaters the form uses, so a value set by the
   * assistant is indistinguishable from a typed one. Both take the functional
   * form of `setValues`, which is what keeps an in-flight reply from clobbering
   * an edit the user made in the form while it was on its way back.
   */
  const applyPatch = useCallback(
    (patch: CoverPagePatch) => {
      const { party1, party2, ...rest } = patch;
      if (Object.keys(rest).length > 0) update(rest);
      if (party1) updateParty("party1", party1);
      if (party2) updateParty("party2", party2);
    },
    [update, updateParty],
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)] print:block">
      <section
        aria-label="Cover page details"
        className="space-y-4 lg:sticky lg:top-6 print:hidden"
      >
        <NdaChat values={values} onPatch={applyPatch} />

        {/*
          Closed by default: the chat is the way in, and an open form beneath it
          would bury the conversation. `<details>` rather than state of our own,
          so it works before hydration and keeps its own keyboard behaviour.
        */}
        <details className="rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700 hover:text-slate-900">
            Edit fields manually
          </summary>
          <div className="border-t border-slate-200 px-4 py-4">
            <CoverPageForm
              values={values}
              onChange={update}
              onPartyChange={updateParty}
            />
          </div>
        </details>
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
  );
}
