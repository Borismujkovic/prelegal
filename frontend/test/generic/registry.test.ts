/**
 * The generated documents the app actually ships.
 *
 * Reads the committed `src/lib/generated/*` rather than regenerating, for the
 * same reason `catalog.test.ts` reads the real catalog: this is what gets
 * built, and a fixture would stay green while it broke.
 */
import { describe, expect, it } from "vitest";
import { DOCUMENT_REGISTRY, DRAFTABLE_DOCUMENT_IDS } from "@/lib/generated";
import type { GeneratedDocument } from "@/lib/generic/types";

/** Locked down so a template or overlay that gains a field has to say so. */
const EXPECTED_FIELDS = {
  "ai-addendum": 4,
  "business-associate-agreement": 4,
  "pilot-agreement": 5,
  "service-level-agreement": 7,
  "design-partner-agreement": 6,
} as const;

const documents = Object.values(DOCUMENT_REGISTRY) as GeneratedDocument[];

describe("the document registry", () => {
  it("holds the five agreements PL-6 brought online", () => {
    expect(new Set(DRAFTABLE_DOCUMENT_IDS)).toEqual(
      new Set(Object.keys(EXPECTED_FIELDS)),
    );
  });

  it("does not hold the Mutual NDA", () => {
    // It has its own hand-written creator at /documents/mutual-nda. If it ever
    // appeared here, the dynamic route would generate that path too and the
    // two would fight over it.
    expect(DOCUMENT_REGISTRY["mutual-nda"]).toBeUndefined();
  });

  it("keys every document by its own id", () => {
    for (const [id, document] of Object.entries(DOCUMENT_REGISTRY)) {
      expect(document.id).toBe(id);
    }
  });
});

describe.each(documents)("$id", (document) => {
  it("asks for the expected number of fields", () => {
    const fields = document.sections.flatMap((section) => section.fields);
    expect(fields).toHaveLength(
      EXPECTED_FIELDS[document.id as keyof typeof EXPECTED_FIELDS],
    );
  });

  it("carries the clauses of its agreement", () => {
    expect(document.clauses.length).toBeGreaterThan(10);
    expect(document.clauses.every((clause) => clause.depth <= 2)).toBe(true);
  });

  it("carries the CC BY attribution, which must travel with the document", () => {
    expect(document.attribution).toMatch(/Common Paper/);
    expect(document.attribution).toMatch(/CC BY 4\.0/);
  });

  it("names two parties, both of them terms the agreement uses", () => {
    const used = new Set<string>();
    const walk = (segments: readonly unknown[]) => {
      for (const segment of segments as { kind: string; field?: string; segments?: [] }[]) {
        if (segment.kind === "field" && segment.field) used.add(segment.field);
        if (segment.kind === "strong" && segment.segments) walk(segment.segments);
      }
    };
    for (const clause of document.clauses) walk(clause.body);

    expect(used).toContain(document.parties.a.field);
    expect(used).toContain(document.parties.b.field);
  });

  it("gives every field a unique camelCase id and a label", () => {
    const fields = document.sections.flatMap((section) => section.fields);
    const ids = fields.map((field) => field.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const field of fields) {
      expect(field.id).toMatch(/^[a-z][A-Za-z0-9]*$/);
      expect(field.label.length).toBeGreaterThan(0);
    }
  });

  it("numbers each term's mentions from zero", () => {
    // The first mention spells the value out and later ones just name the term,
    // so a term whose count never reaches zero would never be spelled out.
    const firsts = new Map<string, boolean>();
    const walk = (segments: readonly unknown[]) => {
      for (const segment of segments as {
        kind: string;
        field?: string;
        occurrence?: number;
        segments?: [];
      }[]) {
        if (segment.kind === "field" && segment.field) {
          if (segment.occurrence === 0) firsts.set(segment.field, true);
        }
        if (segment.kind === "strong" && segment.segments) walk(segment.segments);
      }
    };
    for (const clause of document.clauses) walk(clause.body);

    for (const [term] of firsts) expect(firsts.get(term)).toBe(true);
    expect(firsts.size).toBeGreaterThan(0);
  });
});
