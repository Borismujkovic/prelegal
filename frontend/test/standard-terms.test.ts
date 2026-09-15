import { describe, expect, it } from "vitest";
import { RENDER_CLAUSES, asRenderSegments } from "@/lib/standard-terms";
import {
  COVER_PAGE_PREAMBLE,
  STANDARD_TERMS,
  type SubstitutionField,
  type TemplateSegment,
} from "@/lib/nda-template.generated";

describe("RENDER_CLAUSES", () => {
  it("keeps every clause from the template, in order", () => {
    expect(RENDER_CLAUSES).toHaveLength(STANDARD_TERMS.length);
    expect(RENDER_CLAUSES.map((clause) => clause.number)).toEqual(
      STANDARD_TERMS.map((clause) => clause.number),
    );
    expect(RENDER_CLAUSES.map((clause) => clause.heading)).toEqual(
      STANDARD_TERMS.map((clause) => clause.heading),
    );
  });

  it("numbers the clauses 1..n with no gaps", () => {
    const numbers = RENDER_CLAUSES.map((clause) => clause.number);
    expect(numbers).toEqual(Array.from({ length: numbers.length }, (_, i) => i + 1));
  });

  it("gives every clause a heading and a body", () => {
    for (const clause of RENDER_CLAUSES) {
      expect(clause.heading.trim(), `clause ${clause.number}`).not.toBe("");
      expect(clause.body.length, `clause ${clause.number}`).toBeGreaterThan(0);
    }
  });

  it("preserves the non-field segments untouched", () => {
    const templateNonField = STANDARD_TERMS.flatMap((clause) =>
      clause.body.filter((segment) => segment.kind !== "field"),
    );
    const renderedNonField = RENDER_CLAUSES.flatMap((clause) =>
      clause.body.filter((segment) => segment.kind !== "field"),
    );
    expect(renderedNonField).toEqual(templateNonField);
  });

  it("numbers each field's occurrences 0..n-1 in document order", () => {
    const seen = new Map<SubstitutionField, number[]>();

    for (const clause of RENDER_CLAUSES) {
      for (const segment of clause.body) {
        if (segment.kind !== "field") continue;
        const list = seen.get(segment.field) ?? [];
        list.push(segment.occurrence);
        seen.set(segment.field, list);
      }
    }

    expect(seen.size).toBeGreaterThan(0);
    for (const [field, occurrences] of seen) {
      expect(occurrences, `field: ${field}`).toEqual(
        Array.from({ length: occurrences.length }, (_, i) => i),
      );
    }
  });

  it("counts occurrences independently per field", () => {
    const counts = new Map<SubstitutionField, number>();
    for (const clause of RENDER_CLAUSES) {
      for (const segment of clause.body) {
        if (segment.kind !== "field") continue;
        counts.set(segment.field, (counts.get(segment.field) ?? 0) + 1);
      }
    }
    // Purpose is the field the template reuses most; the first-use-only rule
    // only bites when a field appears more than once.
    expect(counts.get("Purpose") ?? 0).toBeGreaterThan(1);
  });

  it("exposes exactly one first occurrence per field used", () => {
    const firsts = new Map<SubstitutionField, number>();
    for (const clause of RENDER_CLAUSES) {
      for (const segment of clause.body) {
        if (segment.kind !== "field" || segment.occurrence !== 0) continue;
        firsts.set(segment.field, (firsts.get(segment.field) ?? 0) + 1);
      }
    }
    for (const [field, count] of firsts) {
      expect(count, `field: ${field}`).toBe(1);
    }
  });

  it("is computed once and shared, so renderers cannot disagree", () => {
    expect(RENDER_CLAUSES).toBe(RENDER_CLAUSES);
  });
});

describe("asRenderSegments", () => {
  it("treats every field as a first occurrence", () => {
    const segments: TemplateSegment[] = [
      { kind: "text", value: "before " },
      { kind: "field", field: "Purpose" },
      { kind: "text", value: " and " },
      { kind: "field", field: "Purpose" },
    ];

    expect(asRenderSegments(segments)).toEqual([
      { kind: "text", value: "before " },
      { kind: "field", field: "Purpose", occurrence: 0 },
      { kind: "text", value: " and " },
      { kind: "field", field: "Purpose", occurrence: 0 },
    ]);
  });

  it("leaves non-field segments alone", () => {
    const segments: TemplateSegment[] = [
      { kind: "text", value: "plain" },
      { kind: "strong", value: "bold" },
      { kind: "link", value: "CC BY 4.0", href: "https://example.test/" },
    ];
    expect(asRenderSegments(segments)).toEqual(segments);
  });

  it("does not mutate the input", () => {
    const segments: TemplateSegment[] = [{ kind: "field", field: "Purpose" }];
    const snapshot = structuredClone(segments);
    asRenderSegments(segments);
    expect(segments).toEqual(snapshot);
  });

  it("handles the real Cover Page preamble", () => {
    const rendered = asRenderSegments(COVER_PAGE_PREAMBLE);
    expect(rendered).toHaveLength(COVER_PAGE_PREAMBLE.length);
    for (const segment of rendered) {
      if (segment.kind === "field") expect(segment.occurrence).toBe(0);
    }
  });

  it("accepts an empty list", () => {
    expect(asRenderSegments([])).toEqual([]);
  });
});
