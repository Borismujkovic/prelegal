/**
 * Reopening a saved draft.
 *
 * What comes back from the API is `unknown` and genuinely is — the server
 * stores the JSON it was handed and never looks inside it. So these two
 * functions are the only thing standing between a hand-edited row, or a draft
 * written by an older build, and the document renderer.
 *
 * The rule they follow is the same in both: start from the defaults, take only
 * what is recognised, and never throw. A draft that reopens with a field blank
 * is something a user can fix; a draft that cannot be opened at all is not.
 */
import { describe, expect, it } from "vitest";
import { DOCUMENT_REGISTRY } from "@/lib/generated";
import { createDefaultValues } from "@/lib/generic/field-values";
import { restoreGenericValues } from "@/lib/generic/restore";
import { DEFAULT_VALUES } from "@/lib/nda-fields";
import { restoreCoverPageValues } from "@/lib/nda-restore";

const pilot = DOCUMENT_REGISTRY["pilot-agreement"];
const firstFieldId = pilot.sections[0].fields[0].id;

describe("restoring a generic document", () => {
  it("round-trips what was saved", () => {
    const saved = {
      fields: { [firstFieldId]: "2026-10-01" },
      party1: {
        name: "Ada",
        title: "CEO",
        company: "Acme",
        noticeAddress: "legal@acme.example",
      },
      party2: { name: "Bo", title: "", company: "Globex", noticeAddress: "" },
    };

    const restored = restoreGenericValues(pilot, saved);

    expect(restored.fields[firstFieldId]).toBe("2026-10-01");
    expect(restored.party1.company).toBe("Acme");
    expect(restored.party2.name).toBe("Bo");
  });

  it("falls back to defaults for anything that is not an object", () => {
    for (const rubbish of [null, undefined, 7, "values", [], true]) {
      expect(restoreGenericValues(pilot, rubbish)).toEqual(
        createDefaultValues(pilot),
      );
    }
  });

  it("drops a field this document no longer has", () => {
    // A draft saved before the overlay was edited still carries the old key.
    // Reviving it would put a value in `fields` that nothing renders and the
    // completeness count knows nothing about.
    const restored = restoreGenericValues(pilot, {
      fields: { [firstFieldId]: "kept", fieldThatWasRemoved: "dropped" },
    });

    expect(restored.fields).not.toHaveProperty("fieldThatWasRemoved");
    expect(restored.fields[firstFieldId]).toBe("kept");
  });

  it("ignores a field value that is not text", () => {
    const restored = restoreGenericValues(pilot, {
      fields: { [firstFieldId]: { nested: "object" } },
    });

    expect(restored.fields[firstFieldId]).toBe("");
  });

  it("keeps the parts of a party it can use and defaults the rest", () => {
    const restored = restoreGenericValues(pilot, {
      party1: { company: "Acme", name: 42 },
    });

    expect(restored.party1.company).toBe("Acme");
    expect(restored.party1.name).toBe("");
    expect(restored.party2.company).toBe("");
  });
});

describe("restoring a Mutual NDA cover page", () => {
  it("round-trips what was saved, tagged unions included", () => {
    const restored = restoreCoverPageValues({
      purpose: "Evaluating a partnership",
      effectiveDate: "2026-09-17",
      ndaTerm: { kind: "fixed", years: 3 },
      confidentialityTerm: { kind: "perpetual" },
      governingLaw: "Delaware",
      jurisdiction: "New Castle, DE",
      modifications: "",
      party1: { name: "Ada", title: "", company: "Acme", noticeAddress: "" },
      party2: { name: "Bo", title: "", company: "Globex", noticeAddress: "" },
    });

    expect(restored.purpose).toBe("Evaluating a partnership");
    expect(restored.effectiveDate).toBe("2026-09-17");
    expect(restored.ndaTerm).toEqual({ kind: "fixed", years: 3 });
    expect(restored.confidentialityTerm).toEqual({ kind: "perpetual" });
    expect(restored.party2.company).toBe("Globex");
  });

  it("restores a term that runs until it is terminated", () => {
    const restored = restoreCoverPageValues({
      ndaTerm: { kind: "untilTerminated" },
    });

    expect(restored.ndaTerm).toEqual({ kind: "untilTerminated" });
  });

  it("falls back to defaults for anything that is not an object", () => {
    for (const rubbish of [null, undefined, 7, "values", [], true]) {
      expect(restoreCoverPageValues(rubbish)).toEqual(DEFAULT_VALUES);
    }
  });

  it("refuses a term whose tag it does not know", () => {
    const restored = restoreCoverPageValues({
      ndaTerm: { kind: "perpetual" },
      confidentialityTerm: { kind: "untilTerminated" },
    });

    // Each union has its own members: the MNDA term can be `untilTerminated`
    // and confidentiality can be `perpetual`, never the other way round.
    expect(restored.ndaTerm).toEqual(DEFAULT_VALUES.ndaTerm);
    expect(restored.confidentialityTerm).toEqual(
      DEFAULT_VALUES.confidentialityTerm,
    );
  });

  it("refuses a fixed term with a nonsensical length", () => {
    for (const years of [0, -3, 1.5, "two", null]) {
      const restored = restoreCoverPageValues({ ndaTerm: { kind: "fixed", years } });
      expect(restored.ndaTerm).toEqual(DEFAULT_VALUES.ndaTerm);
    }
  });

  it("refuses a date that is not an ISO date", () => {
    // Anything else reaches `formatEffectiveDate`, which returns "" for a date
    // it cannot parse — the document would show a blank where the placeholder
    // belongs, so the gap would stop being visible.
    for (const date of ["9 March 2026", "2026-3-9", "", "tomorrow", 20260309]) {
      expect(restoreCoverPageValues({ effectiveDate: date }).effectiveDate).toBe("");
    }
  });

  it("keeps the fields it understands when its neighbours are rubbish", () => {
    const restored = restoreCoverPageValues({
      purpose: "Still fine",
      governingLaw: { not: "a string" },
      jurisdiction: "Delaware",
    });

    expect(restored.purpose).toBe("Still fine");
    expect(restored.governingLaw).toBe("");
    expect(restored.jurisdiction).toBe("Delaware");
  });
});
