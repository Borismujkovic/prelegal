"use client";

/**
 * The creator: a conversation on the left, the live document on the right.
 *
 * Two components rather than one. The outer one works out which values to start
 * from — a saved draft's, or a blank set — and the inner one owns them from
 * there. Splitting them is what lets the inner component initialise its state
 * once, in `useState`, instead of starting blank and being overwritten by a
 * fetch a moment later.
 *
 * The inner component is the single owner of a document's values. Both the chat
 * and the manual form report changes through the same two updaters, so a value
 * the assistant set is indistinguishable from a typed one everywhere downstream
 * — in the document, in the completeness count, and in the export.
 *
 * Both updaters take the functional form of `setValues`, which is what stops an
 * in-flight reply from clobbering an edit made in the form while it was on its
 * way back.
 *
 * Laid out the same way the Mutual NDA's creator is, deliberately: the two are
 * separate implementations, but they should not feel like separate products.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { DocumentChat } from "@/components/generic/DocumentChat";
import { GenericDocument } from "@/components/generic/GenericDocument";
import { GenericDownloadBar } from "@/components/generic/GenericDownloadBar";
import { GenericForm } from "@/components/generic/GenericForm";
import { buildDraftTitle } from "@/lib/draft-title";
import { splitPatch, type DocumentPatch } from "@/lib/generic/document-chat";
import { createDefaultValues } from "@/lib/generic/field-values";
import { restoreGenericValues } from "@/lib/generic/restore";
import type { GeneratedDocument, GenericValues, Party } from "@/lib/generic/types";
import { useDraftId, useDraftLoad, useDraftSaving } from "@/lib/use-draft";

export function DocumentCreator({
  document: agreement,
}: {
  document: GeneratedDocument;
}) {
  const urlDraftId = useDraftId();

  // Frozen at mount on purpose. Saving a new draft puts its id in the URL so a
  // reload reopens it, and if this tracked the URL that write would look like a
  // request to open a different draft — remounting the creator and throwing
  // away the values that were just saved.
  const [draftId] = useState(urlDraftId);
  const load = useDraftLoad(draftId);

  if (load.status === "loading") {
    return <Panel>Opening your saved draft…</Panel>;
  }

  if (load.status === "error") {
    return (
      <Panel role="alert" tone="error">
        {load.message}
      </Panel>
    );
  }

  // A draft carries the document it belongs to, and `?draft=` is editable by
  // hand, so an NDA's values could otherwise be poured into a Pilot Agreement's
  // form — every field would silently resolve to nothing.
  if (load.status === "loaded" && load.draft.document_id !== agreement.id) {
    return (
      <Panel role="alert" tone="error">
        That saved draft is for a different agreement.
      </Panel>
    );
  }

  const initialValues =
    load.status === "loaded"
      ? restoreGenericValues(agreement, load.draft.values)
      : createDefaultValues(agreement);

  return (
    <DraftingSurface
      document={agreement}
      initialValues={initialValues}
      openedDraftId={draftId}
    />
  );
}

function Panel({
  children,
  role,
  tone = "quiet",
}: {
  children: React.ReactNode;
  role?: "alert";
  tone?: "quiet" | "error";
}) {
  return (
    <p
      role={role}
      className={
        tone === "error"
          ? "rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          : "text-sm text-brand-gray"
      }
    >
      {children}
    </p>
  );
}

function DraftingSurface({
  document: agreement,
  initialValues,
  openedDraftId,
}: {
  document: GeneratedDocument;
  initialValues: GenericValues;
  openedDraftId: number | null;
}) {
  const [values, setValues] = useState<GenericValues>(initialValues);
  const { savedId, saveState, save, markUnsaved } = useDraftSaving(
    agreement.id,
    openedDraftId,
  );

  // Once the values move on, "Saved" is no longer a true statement about them.
  useEffect(() => {
    markUnsaved();
  }, [values, markUnsaved]);

  const updateField = useCallback((id: string, value: string) => {
    setValues((current) => ({
      ...current,
      fields: { ...current.fields, [id]: value },
    }));
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
   * An absent key means "unchanged", never "cleared", so this is a shallow
   * merge rather than a replacement — which is what stops a turn about the
   * governing law from wiping a company name given three messages ago.
   */
  const applyPatch = useCallback(
    (patch: DocumentPatch) => {
      const { fields, party1, party2 } = splitPatch(patch);

      if (Object.keys(fields).length > 0) {
        setValues((current) => ({
          ...current,
          fields: { ...current.fields, ...fields },
        }));
      }
      if (party1) updateParty("party1", party1);
      if (party2) updateParty("party2", party2);
    },
    [updateParty],
  );

  const title = useMemo(
    () =>
      buildDraftTitle(
        agreement.name,
        values.party1.company,
        values.party2.company,
      ),
    [agreement.name, values.party1.company, values.party2.company],
  );

  const handleSave = useCallback(() => {
    save(title, values);
  }, [save, title, values]);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)] print:block">
      <section
        aria-label="Agreement details"
        className="space-y-4 lg:sticky lg:top-6 print:hidden"
      >
        <DocumentChat
          document={agreement}
          values={values}
          onPatch={applyPatch}
        />

        {/*
          Closed by default: the chat is the way in, and an open form beneath it
          would bury the conversation. `<details>` rather than state of our own,
          so it works before hydration and keeps its own keyboard behaviour.
        */}
        <details className="rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-navy hover:opacity-80">
            Edit fields manually
          </summary>
          <div className="border-t border-slate-200 px-4 py-4">
            <GenericForm
              document={agreement}
              values={values}
              onFieldChange={updateField}
              onPartyChange={updateParty}
            />
          </div>
        </details>
      </section>

      <section aria-label="Agreement preview" className="min-w-0 print:block">
        <div className="mb-4 print:hidden">
          <GenericDownloadBar
            document={agreement}
            values={values}
            onSave={handleSave}
            saveState={saveState}
            isSaved={savedId !== null}
          />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm sm:p-12 print:rounded-none print:border-0 print:p-0 print:shadow-none">
          <GenericDocument document={agreement} values={values} />
        </div>
      </section>
    </div>
  );
}
