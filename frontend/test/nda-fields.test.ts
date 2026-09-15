import { describe, expect, it } from "vitest";
import {
  DEFAULT_VALUES,
  EMPTY_PARTY,
  PARTY_FIELDS,
  findMissingFields,
  formatEffectiveDate,
  isValidYears,
  type CoverPageValues,
} from "@/lib/nda-fields";
import { COMPLETE, withValues } from "./fixtures";

describe("formatEffectiveDate", () => {
  it("renders US legal long form", () => {
    expect(formatEffectiveDate("2026-03-09")).toBe("March 9, 2026");
  });

  it("strips the leading zero from the day but keeps the year intact", () => {
    expect(formatEffectiveDate("2026-01-01")).toBe("January 1, 2026");
    expect(formatEffectiveDate("2026-12-31")).toBe("December 31, 2026");
    expect(formatEffectiveDate("0999-06-05")).toBe("June 5, 0999");
  });

  it("covers every month", () => {
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    months.forEach((name, index) => {
      const month = String(index + 1).padStart(2, "0");
      expect(formatEffectiveDate(`2026-${month}-15`)).toBe(`${name} 15, 2026`);
    });
  });

  it("returns empty string for anything that is not a zero-padded ISO date", () => {
    for (const input of [
      "",
      "   ",
      "2026-3-9",
      "26-03-09",
      "03/09/2026",
      "March 9, 2026",
      "2026-03-09T00:00:00",
      "2026-03-09Z",
      " 2026-03-09",
      "not a date",
    ]) {
      expect(formatEffectiveDate(input), `input: ${JSON.stringify(input)}`).toBe("");
    }
  });

  it("returns empty string for out-of-range months", () => {
    expect(formatEffectiveDate("2026-00-09")).toBe("");
    expect(formatEffectiveDate("2026-13-09")).toBe("");
    expect(formatEffectiveDate("2026-99-09")).toBe("");
  });

  it("does not validate the day against the calendar", () => {
    // `<input type="date">` cannot produce these, so the formatter is
    // deliberately naive rather than doing calendar arithmetic that would
    // reintroduce timezone sensitivity.
    expect(formatEffectiveDate("2026-02-30")).toBe("February 30, 2026");
    expect(formatEffectiveDate("2026-04-00")).toBe("April 0, 2026");
  });

  it("is timezone independent", () => {
    // Formatting by hand rather than via Date avoids the off-by-one-day that a
    // UTC-parsed date shows in negative-offset timezones.
    const original = process.env.TZ;
    try {
      for (const tz of ["UTC", "Pacific/Kiritimati", "Pacific/Midway"]) {
        process.env.TZ = tz;
        expect(formatEffectiveDate("2026-03-09")).toBe("March 9, 2026");
      }
    } finally {
      process.env.TZ = original;
    }
  });
});

describe("isValidYears", () => {
  it("accepts positive integers", () => {
    for (const years of [1, 2, 7, 100, 1000]) {
      expect(isValidYears(years), `years: ${years}`).toBe(true);
    }
  });

  it("rejects zero, negatives, fractions and non-finite numbers", () => {
    for (const years of [0, -1, -100, 0.5, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(isValidYears(years), `years: ${years}`).toBe(false);
    }
  });
});

describe("findMissingFields", () => {
  it("reports every required field when nothing is filled in", () => {
    expect(findMissingFields(DEFAULT_VALUES)).toEqual([
      "Purpose",
      "Effective Date",
      "Governing Law",
      "Jurisdiction",
      "Party 1 name",
      "Party 1 company",
      "Party 2 name",
      "Party 2 company",
    ]);
  });

  it("reports nothing for a complete cover page", () => {
    expect(findMissingFields(COMPLETE)).toEqual([]);
  });

  it("treats whitespace-only values as missing", () => {
    expect(findMissingFields(withValues({ purpose: "   " }))).toEqual(["Purpose"]);
    expect(findMissingFields(withValues({ governingLaw: "\t\n" }))).toEqual(["Governing Law"]);
  });

  it("does not require the optional fields", () => {
    // Title, notice address and modifications are all optional.
    const sparse = withValues({
      modifications: "",
      party1: { ...COMPLETE.party1, title: "", noticeAddress: "" },
      party2: { ...COMPLETE.party2, title: "", noticeAddress: "" },
    });
    expect(findMissingFields(sparse)).toEqual([]);
  });

  it("reports an invalid fixed MNDA term length", () => {
    for (const years of [0, -1, 1.5, Number.NaN]) {
      expect(findMissingFields(withValues({ ndaTerm: { kind: "fixed", years } }))).toEqual([
        "MNDA Term length",
      ]);
    }
  });

  it("reports an invalid fixed confidentiality term length", () => {
    expect(
      findMissingFields(withValues({ confidentialityTerm: { kind: "fixed", years: Number.NaN } })),
    ).toEqual(["Term of Confidentiality length"]);
  });

  it("does not ask for a length when the term has no number", () => {
    expect(findMissingFields(withValues({ ndaTerm: { kind: "untilTerminated" } }))).toEqual([]);
    expect(findMissingFields(withValues({ confidentialityTerm: { kind: "perpetual" } }))).toEqual([]);
  });

  it("accumulates several problems at once", () => {
    const broken = withValues({
      purpose: "",
      jurisdiction: "",
      ndaTerm: { kind: "fixed", years: 0 },
      confidentialityTerm: { kind: "fixed", years: -3 },
    });
    expect(findMissingFields(broken)).toEqual([
      "Purpose",
      "Jurisdiction",
      "MNDA Term length",
      "Term of Confidentiality length",
    ]);
  });

  it("does not mutate the values it inspects", () => {
    const values = withValues({ purpose: "  padded  " });
    const snapshot = JSON.parse(JSON.stringify(values)) as CoverPageValues;
    findMissingFields(values);
    expect(values).toEqual(snapshot);
  });
});

describe("DEFAULT_VALUES", () => {
  it("leaves the effective date empty so server and client agree on first render", () => {
    expect(DEFAULT_VALUES.effectiveDate).toBe("");
  });

  it("gives each party its own object rather than sharing one", () => {
    expect(DEFAULT_VALUES.party1).not.toBe(DEFAULT_VALUES.party2);
    expect(DEFAULT_VALUES.party1).not.toBe(EMPTY_PARTY);
    expect(DEFAULT_VALUES.party2).not.toBe(EMPTY_PARTY);
  });

  it("defaults both terms to one year", () => {
    expect(DEFAULT_VALUES.ndaTerm).toEqual({ kind: "fixed", years: 1 });
    expect(DEFAULT_VALUES.confidentialityTerm).toEqual({ kind: "fixed", years: 1 });
  });
});

describe("PARTY_FIELDS", () => {
  it("reads the labelled value off a party", () => {
    expect(PARTY_FIELDS.map((field) => [field.label, field.get(COMPLETE.party1)])).toEqual([
      ["Print Name", "Jane Doe"],
      ["Title", "Chief Executive Officer"],
      ["Company", "Acme, Inc."],
      ["Notice Address", "legal@acme.com"],
    ]);
  });

  it("omits Signature and Date, which are completed at signing", () => {
    const labels = PARTY_FIELDS.map((field) => field.label);
    expect(labels).not.toContain("Signature");
    expect(labels).not.toContain("Date");
  });
});
