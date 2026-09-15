"use client";

/**
 * The Cover Page form. Labels, helper text and placeholders are read from the
 * parsed template so the form stays worded like the agreement it produces.
 */
import {
  isValidYears,
  type CoverPageValues,
  type Party,
} from "@/lib/nda-fields";
import {
  sectionChoice,
  sectionHint,
  sectionPlaceholder,
} from "@/lib/cover-page-copy";

type PartyKey = "party1" | "party2";

type Props = {
  values: CoverPageValues;
  onChange: (patch: Partial<CoverPageValues>) => void;
  onPartyChange: (party: PartyKey, patch: Partial<Party>) => void;
};

const INPUT_CLASS =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs " +
  "placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none";

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-slate-800"
      >
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Fieldset({
  legend,
  description,
  children,
}: {
  legend: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-4 border-t border-slate-200 pt-6">
      <legend className="sr-only">{legend}</legend>
      <div>
        <h2 className="text-sm font-semibold tracking-[0.1em] text-slate-500 uppercase">
          {legend}
        </h2>
        {description ? (
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        ) : null}
      </div>
      {children}
    </fieldset>
  );
}

/** A radio row whose label may contain an inline control. */
function Choice({
  name,
  checked,
  onSelect,
  title,
  children,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      title={title}
      className="flex items-center gap-2.5 text-sm text-slate-700"
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="size-4 shrink-0 accent-indigo-600"
      />
      <span className="flex flex-wrap items-center gap-1.5">{children}</span>
    </label>
  );
}

function YearsInput({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: number;
  disabled: boolean;
  onChange: (years: number) => void;
}) {
  return (
    <input
      id={id}
      type="number"
      min={1}
      step={1}
      value={Number.isNaN(value) ? "" : value}
      disabled={disabled}
      aria-label="Number of years"
      aria-invalid={!disabled && !isValidYears(value)}
      onChange={(event) => onChange(event.target.valueAsNumber)}
      className={
        "w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 " +
        "focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none " +
        "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 " +
        (!disabled && !isValidYears(value) ? "border-amber-500" : "")
      }
    />
  );
}

function PartyFields({
  party,
  legend,
  values,
  onPartyChange,
}: {
  party: PartyKey;
  legend: string;
  values: CoverPageValues;
  onPartyChange: (party: PartyKey, patch: Partial<Party>) => void;
}) {
  const data = values[party];
  const set = (patch: Partial<Party>) => onPartyChange(party, patch);

  return (
    <Fieldset legend={legend}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Print name" htmlFor={`${party}-name`}>
          <input
            id={`${party}-name`}
            className={INPUT_CLASS}
            value={data.name}
            placeholder="Jane Doe"
            onChange={(event) => set({ name: event.target.value })}
          />
        </Field>
        <Field label="Title" htmlFor={`${party}-title`}>
          <input
            id={`${party}-title`}
            className={INPUT_CLASS}
            value={data.title}
            placeholder="Chief Executive Officer"
            onChange={(event) => set({ title: event.target.value })}
          />
        </Field>
      </div>
      <Field label="Company" htmlFor={`${party}-company`}>
        <input
          id={`${party}-company`}
          className={INPUT_CLASS}
          value={data.company}
          placeholder="Acme, Inc."
          onChange={(event) => set({ company: event.target.value })}
        />
      </Field>
      <Field
        label="Notice address"
        hint="Use either an email or a postal address."
        htmlFor={`${party}-notice`}
      >
        <textarea
          id={`${party}-notice`}
          rows={2}
          className={INPUT_CLASS}
          value={data.noticeAddress}
          placeholder="legal@acme.com"
          onChange={(event) => set({ noticeAddress: event.target.value })}
        />
      </Field>
    </Fieldset>
  );
}

export function CoverPageForm({ values, onChange, onPartyChange }: Props) {
  const ndaYears =
    values.ndaTerm.kind === "fixed" ? values.ndaTerm.years : Number.NaN;
  const confidentialityYears =
    values.confidentialityTerm.kind === "fixed"
      ? values.confidentialityTerm.years
      : Number.NaN;

  return (
    <form className="space-y-6" onSubmit={(event) => event.preventDefault()}>
      <Fieldset legend="Agreement terms">
        <Field
          label="Purpose"
          hint={sectionHint("Purpose")}
          htmlFor="purpose"
        >
          <textarea
            id="purpose"
            rows={3}
            className={INPUT_CLASS}
            value={values.purpose}
            placeholder={sectionPlaceholder("Purpose")}
            onChange={(event) => onChange({ purpose: event.target.value })}
          />
        </Field>

        <Field label="Effective date" htmlFor="effective-date">
          <input
            id="effective-date"
            type="date"
            className={INPUT_CLASS}
            value={values.effectiveDate}
            onChange={(event) => onChange({ effectiveDate: event.target.value })}
          />
        </Field>

        <Field label="MNDA term" hint={sectionHint("MNDA Term")}>
          <div className="space-y-2">
            <Choice
              name="nda-term"
              checked={values.ndaTerm.kind === "fixed"}
              onSelect={() => onChange({ ndaTerm: { kind: "fixed", years: 1 } })}
              title={sectionChoice("MNDA Term", 0)}
            >
              Expires
              <YearsInput
                id="nda-term-years"
                value={ndaYears}
                disabled={values.ndaTerm.kind !== "fixed"}
                onChange={(years) => onChange({ ndaTerm: { kind: "fixed", years } })}
              />
              year(s) from the effective date
            </Choice>
            <Choice
              name="nda-term"
              checked={values.ndaTerm.kind === "untilTerminated"}
              onSelect={() => onChange({ ndaTerm: { kind: "untilTerminated" } })}
              title={sectionChoice("MNDA Term", 1)}
            >
              Continues until terminated
            </Choice>
          </div>
        </Field>

        <Field
          label="Term of confidentiality"
          hint={sectionHint("Term of Confidentiality")}
        >
          <div className="space-y-2">
            <Choice
              name="confidentiality-term"
              checked={values.confidentialityTerm.kind === "fixed"}
              onSelect={() =>
                onChange({ confidentialityTerm: { kind: "fixed", years: 1 } })
              }
              title={sectionChoice("Term of Confidentiality", 0)}
            >
              <YearsInput
                id="confidentiality-years"
                value={confidentialityYears}
                disabled={values.confidentialityTerm.kind !== "fixed"}
                onChange={(years) =>
                  onChange({ confidentialityTerm: { kind: "fixed", years } })
                }
              />
              year(s) from the effective date
            </Choice>
            <Choice
              name="confidentiality-term"
              checked={values.confidentialityTerm.kind === "perpetual"}
              onSelect={() =>
                onChange({ confidentialityTerm: { kind: "perpetual" } })
              }
              title={sectionChoice("Term of Confidentiality", 1)}
            >
              In perpetuity
            </Choice>
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Governing law" hint="State" htmlFor="governing-law">
            <input
              id="governing-law"
              className={INPUT_CLASS}
              value={values.governingLaw}
              placeholder="Delaware"
              onChange={(event) => onChange({ governingLaw: event.target.value })}
            />
          </Field>
          {/*
            The clause already reads "courts located in ...", so this takes the
            place alone. The template's own example includes the "courts located
            in" prefix, which would read twice if entered verbatim.
          */}
          <Field
            label="Jurisdiction"
            hint="City or county, and state"
            htmlFor="jurisdiction"
          >
            <input
              id="jurisdiction"
              className={INPUT_CLASS}
              value={values.jurisdiction}
              placeholder="New Castle, DE"
              onChange={(event) => onChange({ jurisdiction: event.target.value })}
            />
          </Field>
        </div>

        <Field
          label="Modifications"
          hint={sectionPlaceholder("MNDA Modifications")}
          htmlFor="modifications"
        >
          <textarea
            id="modifications"
            rows={2}
            className={INPUT_CLASS}
            value={values.modifications}
            placeholder="Leave blank if there are none."
            onChange={(event) => onChange({ modifications: event.target.value })}
          />
        </Field>
      </Fieldset>

      <PartyFields
        party="party1"
        legend="Party 1"
        values={values}
        onPartyChange={onPartyChange}
      />
      <PartyFields
        party="party2"
        legend="Party 2"
        values={values}
        onPartyChange={onPartyChange}
      />
    </form>
  );
}
