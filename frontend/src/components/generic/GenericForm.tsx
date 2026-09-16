"use client";

/**
 * Typing the values in by hand, for anyone who would rather do that than say
 * them — or who needs to correct something the assistant misheard.
 *
 * Fully controlled: every value comes from props and every change goes back
 * out, so the creator above stays the only owner of state and a value set here
 * is indistinguishable from one the assistant set.
 *
 * Labels, hints and placeholders all come from the document's overlay rather
 * than being written here, so the wording lives in one place and the backend's
 * prompt says the same words the form does.
 */
import type {
  FieldSpec,
  GeneratedDocument,
  GenericValues,
  Party,
} from "@/lib/generic/types";

const INPUT_CLASS =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-navy shadow-xs " +
  "placeholder:text-brand-gray focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 focus:outline-none";

function Field({
  spec,
  value,
  onChange,
}: {
  spec: FieldSpec;
  value: string;
  onChange: (value: string) => void;
}) {
  const describedBy = spec.hint ? `${spec.id}-hint` : undefined;

  // Exhaustive by design: FieldType is small, closed and shared by every
  // document, so a new kind of field should stop compiling until it is drawn.
  let control;
  switch (spec.type) {
    case "textarea":
      control = (
        <textarea
          id={spec.id}
          rows={3}
          className={`${INPUT_CLASS} resize-y`}
          value={value}
          placeholder={spec.placeholder}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
      );
      break;
    case "date":
      control = (
        <input
          id={spec.id}
          type="date"
          className={INPUT_CLASS}
          value={value}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
      );
      break;
    case "text":
      control = (
        <input
          id={spec.id}
          type="text"
          className={INPUT_CLASS}
          value={value}
          placeholder={spec.placeholder}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
      );
      break;
    default: {
      const unhandled: never = spec.type;
      throw new Error(`Unhandled field type: ${String(unhandled)}`);
    }
  }

  return (
    <div className="space-y-1">
      <label htmlFor={spec.id} className="block text-sm font-medium text-navy">
        {spec.label}
        {spec.optional ? (
          <span className="ml-1 font-normal text-brand-gray">(optional)</span>
        ) : null}
      </label>
      {spec.hint ? (
        <p id={describedBy} className="text-xs text-brand-gray">
          {spec.hint}
        </p>
      ) : null}
      {control}
    </div>
  );
}

const PARTY_FIELDS: { key: keyof Party; label: string; hint?: string }[] = [
  { key: "company", label: "Company" },
  { key: "name", label: "Signatory name" },
  { key: "title", label: "Signatory title" },
  {
    key: "noticeAddress",
    label: "Notice address",
    hint: "Either an email or a postal address.",
  },
];

function PartyFields({
  legend,
  party,
  slot,
  onChange,
}: {
  legend: string;
  party: Party;
  slot: "party1" | "party2";
  onChange: (patch: Partial<Party>) => void;
}) {
  return (
    <fieldset className="space-y-3 border-t border-slate-200 pt-4">
      <legend className="text-sm font-semibold text-navy">{legend}</legend>
      {PARTY_FIELDS.map((field) => (
        <div key={field.key} className="space-y-1">
          <label
            htmlFor={`${slot}-${field.key}`}
            className="block text-sm font-medium text-navy"
          >
            {field.label}
          </label>
          {field.hint ? (
            <p className="text-xs text-brand-gray">{field.hint}</p>
          ) : null}
          <input
            id={`${slot}-${field.key}`}
            type="text"
            className={INPUT_CLASS}
            value={party[field.key]}
            onChange={(event) => onChange({ [field.key]: event.target.value })}
          />
        </div>
      ))}
    </fieldset>
  );
}

export function GenericForm({
  document: agreement,
  values,
  onFieldChange,
  onPartyChange,
}: {
  document: GeneratedDocument;
  values: GenericValues;
  onFieldChange: (id: string, value: string) => void;
  onPartyChange: (party: "party1" | "party2", patch: Partial<Party>) => void;
}) {
  return (
    <div className="space-y-6">
      <PartyFields
        legend={agreement.parties.a.label}
        party={values.party1}
        slot="party1"
        onChange={(patch) => onPartyChange("party1", patch)}
      />
      <PartyFields
        legend={agreement.parties.b.label}
        party={values.party2}
        slot="party2"
        onChange={(patch) => onPartyChange("party2", patch)}
      />

      {agreement.sections.map((section) => (
        <fieldset
          key={section.title}
          className="space-y-3 border-t border-slate-200 pt-4"
        >
          <legend className="text-sm font-semibold text-navy">
            {section.title}
          </legend>
          {section.hint ? (
            <p className="text-xs text-brand-gray">{section.hint}</p>
          ) : null}
          {section.fields.map((spec) => (
            <Field
              key={spec.id}
              spec={spec}
              value={values.fields[spec.id] ?? ""}
              onChange={(value) => onFieldChange(spec.id, value)}
            />
          ))}
        </fieldset>
      ))}
    </div>
  );
}
