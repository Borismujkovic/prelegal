/**
 * Renders the completed MNDA as markdown for download.
 *
 * Mirrors what `NdaDocument` shows on screen: the Cover Page carrying the user's
 * values, followed by the Standard Terms with substitutions applied. Section
 * titles and boilerplate come from the generated template data, so the export
 * never restates legal text of its own.
 */
import {
  COVER_PAGE_ATTRIBUTION,
  COVER_PAGE_PREAMBLE,
  COVER_PAGE_PREAMBLE_HEADING,
  COVER_PAGE_SECTIONS,
  COVER_PAGE_SIGNATURE_INTRO,
  COVER_PAGE_TITLE,
  STANDARD_TERMS_ATTRIBUTION,
  type CoverPageSectionTitle,
} from "./nda-template.generated";
import {
  RENDER_CLAUSES,
  asRenderSegments,
  type RenderSegment,
} from "./standard-terms";
import { PARTY_FIELDS, type CoverPageValues } from "./nda-fields";
import {
  describeConfidentialityTerm,
  describeNdaTerm,
  fieldRenderToText,
  renderField,
  resolveField,
} from "./substitutions";

/**
 * Escapes the markdown constructs that would otherwise reinterpret text the
 * user typed — emphasis, code spans and link brackets.
 *
 * Applied only to supplied values, never to the template's own markdown, and
 * never to `[Placeholder]` markers, whose brackets are meant to show through.
 */
function escapeInline(text: string): string {
  return text.replace(/[\\`*_[\]]/g, "\\$&");
}

/**
 * As `escapeInline`, plus the constructs that only have meaning at the start of
 * a line. Used for the one multi-line free-text field, where a line beginning
 * "1." or "- " would otherwise turn into a list and restructure the document
 * relative to the on-screen preview.
 */
function escapeBlock(text: string): string {
  return escapeInline(text)
    .replace(/^(\s*)([#>+-])/gm, "$1\\$2")
    .replace(/^(\s*\d+)\./gm, "$1\\.");
}

/** Escapes a resolved value unless it is an unfilled `[Placeholder]`. */
function escapeResolved({ text, filled }: { text: string; filled: boolean }): string {
  return filled ? escapeInline(text) : text;
}

function segmentsToMarkdown(
  segments: readonly RenderSegment[],
  values: CoverPageValues,
): string {
  return segments
    .map((segment) => {
      switch (segment.kind) {
        case "text":
          return segment.value;
        case "strong":
          return `**${segment.value}**`;
        case "link":
          return `[${segment.value}](${segment.href})`;
        case "field":
          return fieldRenderToText(
            renderField(segment.field, values, segment.occurrence),
            escapeResolved,
          );
      }
    })
    .join("");
}

/**
 * The lines shown under one Cover Page section heading.
 *
 * Exhaustive over `CoverPageSectionTitle`: if an upstream template revision adds
 * a section, the `never` assignment fails to compile here and in
 * `NdaDocument.tsx`, so the two renderers cannot silently disagree.
 */
function coverPageSectionBody(
  title: CoverPageSectionTitle,
  values: CoverPageValues,
): string[] {
  switch (title) {
    case "Purpose":
      return [escapeResolved(resolveField("Purpose", values))];
    case "Effective Date":
      return [escapeResolved(resolveField("Effective Date", values))];
    case "MNDA Term":
      return [escapeResolved(describeNdaTerm(values))];
    case "Term of Confidentiality":
      return [escapeResolved(describeConfidentialityTerm(values))];
    case "Governing Law & Jurisdiction":
      return [
        `Governing Law: ${escapeResolved(resolveField("Governing Law", values))}`,
        "",
        `Jurisdiction: ${escapeResolved(resolveField("Jurisdiction", values))}`,
      ];
    case "MNDA Modifications": {
      const modifications = values.modifications.trim();
      return [modifications ? escapeBlock(modifications) : "None."];
    }
    default: {
      const unhandled: never = title;
      throw new Error(`Unhandled Cover Page section: ${String(unhandled)}`);
    }
  }
}

/** Table cells must not break the markdown row they sit in. */
function escapeCell(value: string): string {
  return escapeInline(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/**
 * Signature and Date are left blank in both columns: they are completed when the
 * agreement is signed, and the signing date is not necessarily the Effective
 * Date.
 */
function signatureTable(values: CoverPageValues): string {
  const partyRows = PARTY_FIELDS.map(
    (field) =>
      `| ${field.label} | ${escapeCell(field.get(values.party1))} | ${escapeCell(
        field.get(values.party2),
      )} |`,
  );

  return [
    "| | PARTY 1 | PARTY 2 |",
    "| --- | --- | --- |",
    "| Signature |  |  |",
    ...partyRows,
    "| Date |  |  |",
  ].join("\n");
}

export function buildMarkdown(values: CoverPageValues): string {
  const blocks: string[] = [
    `# ${COVER_PAGE_TITLE}`,
    `## ${COVER_PAGE_PREAMBLE_HEADING}`,
    segmentsToMarkdown(asRenderSegments(COVER_PAGE_PREAMBLE), values),
  ];

  for (const section of COVER_PAGE_SECTIONS) {
    blocks.push(`### ${section.title}`);
    const body = coverPageSectionBody(section.title, values);
    if (body.length > 0) {
      blocks.push(body.join("\n"));
    }
  }

  blocks.push(
    COVER_PAGE_SIGNATURE_INTRO,
    signatureTable(values),
    segmentsToMarkdown(asRenderSegments(COVER_PAGE_ATTRIBUTION), values),
    "---",
    "# Standard Terms",
  );

  for (const clause of RENDER_CLAUSES) {
    blocks.push(
      `${clause.number}. **${clause.heading}**. ${segmentsToMarkdown(clause.body, values)}`,
    );
  }

  blocks.push(
    segmentsToMarkdown(asRenderSegments(STANDARD_TERMS_ATTRIBUTION), values),
  );

  return `${blocks.join("\n\n")}\n`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** e.g. `mutual-nda-acme-globex.md`, falling back to `mutual-nda.md`. */
export function buildFilename(values: CoverPageValues): string {
  const parties = [values.party1.company, values.party2.company]
    .map(slugify)
    .filter(Boolean);

  return parties.length > 0
    ? `mutual-nda-${parties.join("-")}.md`
    : "mutual-nda.md";
}
