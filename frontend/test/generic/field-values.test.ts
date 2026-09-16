/**
 * Turning what was filled in into what the document says.
 *
 * Exercised against the real Pilot Agreement, which is the one document in
 * scope that uses every shape: ordinary fields, a date, both party roles, and a
 * Notice Address that comes from the signature block rather than a field.
 */
import { describe, expect, it } from "vitest";
import {
  createDefaultValues,
  findMissingFields,
  renderField,
  resolveValue,
  specForField,
} from "@/lib/generic/field-values";
import { DOCUMENT_REGISTRY } from "@/lib/generated";
import type { GenericValues } from "@/lib/generic/types";

const pilot = DOCUMENT_REGISTRY["pilot-agreement"];

function filled(overrides: Partial<GenericValues> = {}): GenericValues {
  const base = createDefaultValues(pilot);
  return {
    ...base,
    ...overrides,
    party1: { ...base.party1, ...overrides.party1 },
    party2: { ...base.party2, ...overrides.party2 },
    fields: { ...base.fields, ...overrides.fields },
  };
}

describe("default values", () => {
  it("starts every field empty rather than guessing", () => {
    const values = createDefaultValues(pilot);
    expect(Object.values(values.fields).every((value) => value === "")).toBe(true);
  });

  it("has a key for every field the document asks about", () => {
    const values = createDefaultValues(pilot);
    for (const section of pilot.sections) {
      for (const field of section.fields) {
        expect(values.fields).toHaveProperty(field.id);
      }
    }
  });
});

describe("resolving a term", () => {
  it("reads a party role from that party's company", () => {
    const values = filled({ party2: { company: "Globex" } as never });
    expect(resolveValue(pilot, values, pilot.parties.b.field)).toBe("Globex");
  });

  it("reads an ordinary field from the values", () => {
    const values = filled({ fields: { pilotPeriod: "90 days" } });
    expect(resolveValue(pilot, values, "Pilot Period")).toBe("90 days");
  });

  it("builds the notice address from both signature blocks", () => {
    // Nobody is asked for this twice: it is already collected per party.
    const values = filled({
      party1: { company: "Acme", noticeAddress: "legal@acme.com" } as never,
      party2: { company: "Globex", noticeAddress: "legal@globex.com" } as never,
    });

    expect(resolveValue(pilot, values, "Notice Address")).toBe(
      "Acme: legal@acme.com; Globex: legal@globex.com",
    );
  });

  it("falls back to the role name when a company has not been given", () => {
    const values = filled({
      party1: { noticeAddress: "legal@acme.com" } as never,
    });

    expect(resolveValue(pilot, values, "Notice Address")).toBe(
      "Provider: legal@acme.com",
    );
  });

  it("is empty when nothing has been filled in", () => {
    expect(resolveValue(pilot, createDefaultValues(pilot), "Pilot Period")).toBe("");
  });
});

describe("rendering a mention", () => {
  const values = filled({ fields: { pilotPeriod: "90 days" } });

  it("spells the value out on first mention", () => {
    expect(renderField(pilot, values, "Pilot Period", 0)).toEqual({
      kind: "termWithValue",
      term: "Pilot Period",
      value: "90 days",
    });
  });

  it("just names the term afterwards", () => {
    expect(renderField(pilot, values, "Pilot Period", 3)).toEqual({
      kind: "term",
      term: "Pilot Period",
    });
  });

  it("shows an unfilled term as a placeholder, at any mention", () => {
    const empty = createDefaultValues(pilot);
    // A gap the reader can see beats an invisible one.
    expect(renderField(pilot, empty, "Pilot Period", 0).kind).toBe("placeholder");
    expect(renderField(pilot, empty, "Pilot Period", 2).kind).toBe("placeholder");
  });
});

describe("what is still outstanding", () => {
  it("counts both parties and every required field at the start", () => {
    const missing = findMissingFields(pilot, createDefaultValues(pilot));
    expect(missing).toContain("Provider");
    expect(missing).toContain("Customer");
    expect(missing).toContain("Pilot period");
  });

  it("stops counting a field once it is filled in", () => {
    const values = filled({ fields: { pilotPeriod: "90 days" } });
    expect(findMissingFields(pilot, values)).not.toContain("Pilot period");
  });

  it("never counts an optional field", () => {
    // The Design Partner Agreement's fees are optional, because a design
    // partnership that costs nothing is the normal case.
    const design = DOCUMENT_REGISTRY["design-partner-agreement"];
    const missing = findMissingFields(design, createDefaultValues(design));
    expect(missing).not.toContain("Fees");
  });

  it("counts a notice address the agreement actually substitutes", () => {
    // The Pilot Agreement sends notices to the Notice Address, which is filled
    // from the signature blocks. Without this the bar would call the draft
    // finished while the document still printed a placeholder.
    const values = filled({
      party1: { company: "Acme" } as never,
      party2: { company: "Globex" } as never,
    });

    expect(findMissingFields(pilot, values)).toContain("Provider notice address");
    expect(findMissingFields(pilot, values)).toContain("Customer notice address");
  });

  it("does not ask for a notice address the agreement never mentions", () => {
    // An addendum inherits notice terms from the agreement it attaches to.
    const addendum = DOCUMENT_REGISTRY["ai-addendum"];
    const values = createDefaultValues(addendum);
    values.party1.company = "Acme";
    values.party2.company = "Globex";

    expect(findMissingFields(addendum, values).join(" ")).not.toContain(
      "notice address",
    );
  });

  it("is empty once everything required has been given", () => {
    const values = filled({
      party1: { company: "Acme", noticeAddress: "legal@acme.example" } as never,
      party2: { company: "Globex", noticeAddress: "legal@globex.example" } as never,
      fields: Object.fromEntries(
        pilot.sections
          .flatMap((section) => section.fields)
          .map((field) => [field.id, "x"]),
      ),
    });

    expect(findMissingFields(pilot, values)).toEqual([]);
  });
});

describe("looking up a field spec", () => {
  it("finds the spec behind a term", () => {
    expect(specForField(pilot, "Pilot Period")?.id).toBe("pilotPeriod");
  });

  it("returns nothing for a term filled from the signature block", () => {
    expect(specForField(pilot, "Notice Address")).toBeUndefined();
  });
});
