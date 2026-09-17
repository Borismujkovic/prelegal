/**
 * Renders the complete MNDA: the Cover Page carrying the user's values followed
 * by the Standard Terms with substitutions applied.
 *
 * This is also what gets printed — `globals.css` hides the surrounding app
 * chrome under `@media print` so the browser's "Save as PDF" produces the
 * document on its own.
 */
import { DocumentDisclaimer } from "@/components/DocumentDisclaimer";
import {
  COVER_PAGE_ATTRIBUTION,
  COVER_PAGE_PREAMBLE,
  COVER_PAGE_PREAMBLE_HEADING,
  COVER_PAGE_SECTIONS,
  COVER_PAGE_SIGNATURE_INTRO,
  COVER_PAGE_TITLE,
  STANDARD_TERMS_ATTRIBUTION,
  type CoverPageSectionTitle,
  type TemplateSegment,
} from "@/lib/nda-template.generated";
import {
  RENDER_CLAUSES,
  asRenderSegments,
  type RenderSegment,
} from "@/lib/standard-terms";
import { PARTY_FIELDS, type CoverPageValues } from "@/lib/nda-fields";
import {
  describeConfidentialityTerm,
  describeNdaTerm,
  renderField,
  resolveField,
  type FieldRender,
  type ResolvedField,
} from "@/lib/substitutions";

/**
 * A value the user has not supplied yet. Shown in place rather than blocking the
 * preview, so the shape of the agreement is visible from the start.
 */
function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-sm bg-amber-100 px-1 text-amber-900 ring-1 ring-amber-300/70 print:bg-transparent print:text-inherit print:ring-0">
      {children}
    </span>
  );
}

/**
 * Text that carries meaning against the surrounding boilerplate: a supplied
 * value, or a capitalised term the Cover Page defines.
 */
function Emphasised({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-slate-900">{children}</span>;
}

function Value({ resolved }: { resolved: ResolvedField }) {
  return resolved.filled ? (
    <Emphasised>{resolved.text}</Emphasised>
  ) : (
    <Placeholder>{resolved.text}</Placeholder>
  );
}

function Field({ render }: { render: FieldRender }) {
  switch (render.kind) {
    case "value":
      return <Value resolved={{ text: render.value, filled: render.filled }} />;
    case "term":
      return <Emphasised>{render.term}</Emphasised>;
    case "termWithValue":
      return (
        <>
          <Emphasised>{render.term}</Emphasised>
          {" ("}
          <Value resolved={{ text: render.value, filled: render.filled }} />
          {")"}
        </>
      );
  }
}

function Segments({
  segments,
  values,
}: {
  segments: readonly RenderSegment[];
  values: CoverPageValues;
}) {
  return (
    <>
      {segments.map((segment, index) => {
        switch (segment.kind) {
          case "text":
            return <span key={index}>{segment.value}</span>;
          case "strong":
            return (
              <strong key={index} className="font-semibold text-slate-900">
                {segment.value}
              </strong>
            );
          case "link":
            return (
              <a
                key={index}
                href={segment.href}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-700 underline underline-offset-2 print:text-inherit print:no-underline"
              >
                {segment.value}
              </a>
            );
          case "field":
            return (
              <Field
                key={index}
                render={renderField(segment.field, values, segment.occurrence)}
              />
            );
        }
      })}
    </>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-7 mb-1.5 text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">
      {children}
    </h3>
  );
}

/**
 * The body of one Cover Page section, driven by the section's template title.
 *
 * Exhaustive over `CoverPageSectionTitle` — see the matching switch in
 * `markdown-export.ts`, which must stay in step with this one.
 */
function CoverPageSectionBody({
  title,
  values,
}: {
  title: CoverPageSectionTitle;
  values: CoverPageValues;
}) {
  switch (title) {
    case "Purpose":
      return <Value resolved={resolveField("Purpose", values)} />;
    case "Effective Date":
      return <Value resolved={resolveField("Effective Date", values)} />;
    case "MNDA Term":
      return <Value resolved={describeNdaTerm(values)} />;
    case "Term of Confidentiality":
      return <Value resolved={describeConfidentialityTerm(values)} />;
    case "Governing Law & Jurisdiction":
      return (
        <div className="space-y-1">
          <p>
            <span className="text-slate-500">Governing Law: </span>
            <Value resolved={resolveField("Governing Law", values)} />
          </p>
          <p>
            <span className="text-slate-500">Jurisdiction: </span>
            <Value resolved={resolveField("Jurisdiction", values)} />
          </p>
        </div>
      );
    case "MNDA Modifications":
      return values.modifications.trim() ? (
        <p className="whitespace-pre-wrap">{values.modifications.trim()}</p>
      ) : (
        <p className="text-slate-500 italic">None.</p>
      );
    default: {
      const unhandled: never = title;
      throw new Error(`Unhandled Cover Page section: ${String(unhandled)}`);
    }
  }
}

/** One labelled cell in the signature block. */
function SignatureCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-slate-200 px-3 py-2.5">
      <div className="text-[0.65rem] tracking-wider text-slate-400 uppercase">
        {label}
      </div>
      <div className="mt-0.5 min-h-[1.5rem] text-slate-900">
        {value || <span className="text-slate-300">&mdash;</span>}
      </div>
    </div>
  );
}

/** A rule for something filled in by hand at signing. */
function SigningLine({ label }: { label: string }) {
  return (
    <div className="border-t border-slate-200 px-3 pt-7 pb-2">
      <div className="border-b border-slate-400" />
      <div className="mt-1 text-[0.65rem] tracking-wider text-slate-400 uppercase">
        {label}
      </div>
    </div>
  );
}

function SignatureBlock({ values }: { values: CoverPageValues }) {
  const parties = [
    { heading: "Party 1", party: values.party1 },
    { heading: "Party 2", party: values.party2 },
  ];

  return (
    <div className="mt-5 grid gap-5 sm:grid-cols-2 print:grid-cols-2">
      {parties.map(({ heading, party }) => (
        <div
          key={heading}
          className="break-inside-avoid rounded-md border border-slate-200 print:rounded-none"
        >
          <div className="px-3 py-2 text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">
            {heading}
          </div>
          {PARTY_FIELDS.map((field) => (
            <SignatureCell
              key={field.label}
              label={field.label}
              value={field.get(party)}
            />
          ))}
          {/*
            Signature and Date are completed when the agreement is signed. Date
            is the signing date, which is not necessarily the Effective Date, so
            it is left blank rather than assumed.
          */}
          <SigningLine label="Signature" />
          <SigningLine label="Date" />
        </div>
      ))}
    </div>
  );
}

/**
 * The CC BY 4.0 notice. Rendered from template segments so the licence link is
 * preserved — `templates/README.md` requires the attribution to travel with
 * anything generated from these templates.
 */
function Attribution({
  segments,
  values,
}: {
  segments: readonly TemplateSegment[];
  values: CoverPageValues;
}) {
  return (
    <p className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-500">
      <Segments segments={asRenderSegments(segments)} values={values} />
    </p>
  );
}

export function NdaDocument({ values }: { values: CoverPageValues }) {
  return (
    <article className="font-serif text-[0.95rem] leading-relaxed text-slate-700">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {COVER_PAGE_TITLE}
        </h1>
        <h2 className="mt-6 text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">
          {COVER_PAGE_PREAMBLE_HEADING}
        </h2>
        <p className="mt-2 text-sm">
          <Segments
            segments={asRenderSegments(COVER_PAGE_PREAMBLE)}
            values={values}
          />
        </p>
      </header>

      <section>
        {COVER_PAGE_SECTIONS.map((section) => (
          <div key={section.title} className="break-inside-avoid">
            <SectionHeading>{section.title}</SectionHeading>
            {section.hint ? (
              <p className="mb-1 text-xs text-slate-400 italic print:hidden">
                {section.hint}
              </p>
            ) : null}
            <CoverPageSectionBody title={section.title} values={values} />
          </div>
        ))}
      </section>

      <section className="mt-9">
        <p className="text-sm">{COVER_PAGE_SIGNATURE_INTRO}</p>
        <SignatureBlock values={values} />
      </section>

      <Attribution segments={COVER_PAGE_ATTRIBUTION} values={values} />

      <section className="mt-12 break-before-page">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">
          Standard Terms
        </h2>
        <ol className="mt-4 space-y-4">
          {RENDER_CLAUSES.map((clause) => (
            <li key={clause.number} className="flex gap-2.5 text-justify">
              <span className="shrink-0 font-medium text-slate-500 tabular-nums">
                {clause.number}.
              </span>
              <p>
                <strong className="font-semibold text-slate-900">
                  {clause.heading}
                </strong>
                {". "}
                <Segments segments={clause.body} values={values} />
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* Before the attribution, never instead of it: the CC BY credit has to
          travel with anything generated from a Common Paper template. */}
      <DocumentDisclaimer />

      <Attribution segments={STANDARD_TERMS_ATTRIBUTION} values={values} />
    </article>
  );
}
