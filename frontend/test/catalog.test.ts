/**
 * The catalog the app actually ships.
 *
 * catalog.json is read by the backend and rendered by the dashboard, so these
 * assertions guard the contract between them. They read the real file rather
 * than a fixture — a fixture would happily stay green while the shipped catalog
 * broke.
 */
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { draftingRouteFor, type Catalog } from "@/lib/catalog";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const catalog = JSON.parse(
  readFileSync(join(REPO_ROOT, "catalog.json"), "utf8"),
) as Catalog;

describe("catalog.json", () => {
  it("holds the eleven documents the product promises", () => {
    expect(catalog.documents).toHaveLength(11);
  });

  it("gives every document a unique id", () => {
    const ids = catalog.documents.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("points every template path at a file that exists", () => {
    for (const entry of catalog.documents) {
      expect(existsSync(join(REPO_ROOT, entry.standard_terms)), entry.id).toBe(true);
      if (entry.cover_page) {
        expect(existsSync(join(REPO_ROOT, entry.cover_page)), entry.id).toBe(true);
      }
    }
  });

  it("marks exactly the Mutual NDA as available", () => {
    const available = catalog.documents.filter((entry) => entry.available);
    expect(available.map((entry) => entry.id)).toEqual(["mutual-nda"]);
  });

  it("keeps the Common Paper attribution", () => {
    expect(catalog.attribution).toMatch(/Common Paper/);
  });

  it("gives every document the copy the dashboard renders", () => {
    for (const entry of catalog.documents) {
      expect(entry.name.length, entry.id).toBeGreaterThan(0);
      expect(entry.summary.length, entry.id).toBeGreaterThan(0);
      expect(entry.use_when.length, entry.id).toBeGreaterThan(0);
    }
  });
});

describe("draftingRouteFor", () => {
  it("routes an available document to its creator", () => {
    const nda = catalog.documents.find((entry) => entry.id === "mutual-nda")!;
    expect(draftingRouteFor(nda)).toBe("/documents/mutual-nda");
  });

  it("gives an unavailable document no route", () => {
    const unavailable = catalog.documents.find((entry) => !entry.available)!;
    expect(draftingRouteFor(unavailable)).toBeNull();
  });
});
