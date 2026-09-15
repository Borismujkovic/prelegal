/**
 * The Standard Terms clauses annotated with, for each substitution point, how
 * many times that field has already appeared earlier in the document.
 *
 * A defined term is spelled out with its value on first use and referenced by
 * name afterwards, so rendering needs to know which occurrence it is looking at.
 * Computed once here rather than threading a mutable counter through the
 * renderers, which keeps both the React and markdown outputs consistent.
 */
import {
  STANDARD_TERMS,
  type SubstitutionField,
  type TemplateSegment,
} from "./nda-template.generated";

export type RenderSegment =
  | Exclude<TemplateSegment, { kind: "field" }>
  | { kind: "field"; field: SubstitutionField; occurrence: number };

export type RenderClause = {
  number: number;
  heading: string;
  body: readonly RenderSegment[];
};

function annotate(): readonly RenderClause[] {
  const seen = new Map<SubstitutionField, number>();

  return STANDARD_TERMS.map((clause) => ({
    number: clause.number,
    heading: clause.heading,
    body: clause.body.map((segment): RenderSegment => {
      if (segment.kind !== "field") return segment;

      const occurrence = seen.get(segment.field) ?? 0;
      seen.set(segment.field, occurrence + 1);
      return { kind: "field", field: segment.field, occurrence };
    }),
  }));
}

export const RENDER_CLAUSES = annotate();

/**
 * Widens template segments that sit outside the numbered clauses (the Cover Page
 * preamble) so they can go through the same renderer. These carry no
 * substitution points, so every field is treated as a first occurrence.
 */
export function asRenderSegments(
  segments: readonly TemplateSegment[],
): readonly RenderSegment[] {
  return segments.map((segment) =>
    segment.kind === "field" ? { ...segment, occurrence: 0 } : segment,
  );
}
