"use client";

/**
 * The creator: a conversation on the left, the live document on the right.
 *
 * The single owner of a document's values. Both the chat and the manual form
 * report changes through the same two updaters, so a value the assistant set is
 * indistinguishable from a typed one everywhere downstream — in the document,
 * in the completeness count, and in the export.
 *
 * Both updaters take the functional form of `setValues`, which is what stops an
 * in-flight reply from clobbering an edit made in the form while it was on its
 * way back.
 *
 * Laid out the same way the Mutual NDA's creator is, deliberately: the two are
 * separate implementations, but they should not feel like separate products.
 */
import { useCallback, useMemo, useState } from "react";
import { DocumentChat } from "@/components/generic/DocumentChat";
import { GenericDocument } from "@/components/generic/GenericDocument";
import { GenericDownloadBar } from "@/components/generic/GenericDownloadBar";
import { GenericForm } from "@/components/generic/GenericForm";
import { splitPatch, type DocumentPatch } from "@/lib/generic/document-chat";
import { createDefaultValues } from "@/lib/generic/field-values";
import type { GeneratedDocument, GenericValues, Party } from "@/lib/generic/types";

export function DocumentCreator({
  document: agreement,
}: {
  document: GeneratedDocument;
}) {
  const initial = useMemo(() => createDefaultValues(agreement), [agreement]);
  const [values, setValues] = useState<GenericValues>(initial);

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
  const applyPatch = useCallback((patch: DocumentPatch) => {
    const { fields, party1, party2 } = splitPatch(patch);

    if (Object.keys(fields).length > 0) {
      setValues((current) => ({
        ...current,
        fields: { ...current.fields, ...fields },
      }));
    }
    if (party1) updateParty("party1", party1);
    if (party2) updateParty("party2", party2);
  }, [updateParty]);

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
          <GenericDownloadBar document={agreement} values={values} />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm sm:p-12 print:rounded-none print:border-0 print:p-0 print:shadow-none">
          <GenericDocument document={agreement} values={values} />
        </div>
      </section>
    </div>
  );
}
