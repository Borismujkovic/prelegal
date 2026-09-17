"use client";

/**
 * Mutual NDA creator: a conversation with the drafting assistant on the left,
 * the live document on the right. The Cover Page form is still here, tucked
 * into a disclosure under the chat, for anyone who would rather type a value
 * than say it — or who needs to correct one the assistant misheard.
 *
 * Split in two the same way the generic creator is: the outer component decides
 * which values to start from — a saved draft's, or a blank Cover Page — and the
 * inner one owns them from there, so its `useState` initialises once rather
 * than starting blank and being overwritten by a fetch.
 *
 * Values leave the browser for two reasons only: a chat turn, which stores
 * nothing, and an explicit save.
 *
 * The page header lives in the surrounding shell (`../layout.tsx`), which is
 * also what marks it `print:hidden` so it stays out of the generated PDF. The
 * `<Suspense>` this page needs in order to read `?draft=` lives there too.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CoverPageForm } from "@/components/CoverPageForm";
import { DownloadBar } from "@/components/DownloadBar";
import { NdaChat } from "@/components/NdaChat";
import { NdaDocument } from "@/components/NdaDocument";
import type { CoverPagePatch } from "@/lib/chat";
import { buildDraftTitle } from "@/lib/draft-title";
import {
  DEFAULT_VALUES,
  type CoverPageValues,
  type Party,
} from "@/lib/nda-fields";
import { restoreCoverPageValues } from "@/lib/nda-restore";
import { useDraftId, useDraftLoad, useDraftSaving } from "@/lib/use-draft";

const DOCUMENT_ID = "mutual-nda";
const DOCUMENT_NAME = "Mutual NDA";

export default function MutualNdaPage() {
  const urlDraftId = useDraftId();

  // Frozen at mount: saving writes the new id into the URL, and tracking it
  // here would read that write as a request to open a different draft.
  const [draftId] = useState(urlDraftId);
  const load = useDraftLoad(draftId);

  if (load.status === "loading") {
    return <Panel>Opening your saved draft…</Panel>;
  }

  if (load.status === "error") {
    return <Panel tone="error">{load.message}</Panel>;
  }

  if (load.status === "loaded" && load.draft.document_id !== DOCUMENT_ID) {
    return <Panel tone="error">That saved draft is for a different agreement.</Panel>;
  }

  const initialValues =
    load.status === "loaded"
      ? restoreCoverPageValues(load.draft.values)
      : DEFAULT_VALUES;

  return <CoverPageSurface initialValues={initialValues} openedDraftId={draftId} />;
}

function Panel({
  children,
  tone = "quiet",
}: {
  children: ReactNode;
  tone?: "quiet" | "error";
}) {
  return (
    <p
      role={tone === "error" ? "alert" : undefined}
      className={
        tone === "error"
          ? "rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          : "text-sm text-slate-500"
      }
    >
      {children}
    </p>
  );
}

function CoverPageSurface({
  initialValues,
  openedDraftId,
}: {
  initialValues: CoverPageValues;
  openedDraftId: number | null;
}) {
  const [values, setValues] = useState<CoverPageValues>(initialValues);
  const { savedId, saveState, save, markUnsaved } = useDraftSaving(
    DOCUMENT_ID,
    openedDraftId,
  );

  useEffect(() => {
    markUnsaved();
  }, [values, markUnsaved]);

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

  const title = useMemo(
    () =>
      buildDraftTitle(
        DOCUMENT_NAME,
        values.party1.company,
        values.party2.company,
      ),
    [values.party1.company, values.party2.company],
  );

  const handleSave = useCallback(() => {
    save(title, values);
  }, [save, title, values]);

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
          <DownloadBar
            values={values}
            onSave={handleSave}
            saveState={saveState}
            isSaved={savedId !== null}
          />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm sm:p-12 print:rounded-none print:border-0 print:p-0 print:shadow-none">
          <NdaDocument values={values} />
        </div>
      </section>
    </div>
  );
}
