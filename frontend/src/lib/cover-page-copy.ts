/**
 * Looks up form copy — labels, helper text, placeholders — from the parsed Cover
 * Page template, so the form is worded the way the agreement is worded.
 */
import {
  COVER_PAGE_SECTIONS,
  type CoverPageSection,
} from "./nda-template.generated";

const BY_TITLE = new Map<string, CoverPageSection>(
  COVER_PAGE_SECTIONS.map((section) => [section.title, section]),
);

export function coverSection(title: string): CoverPageSection | undefined {
  return BY_TITLE.get(title);
}

/**
 * The template writes fill-in hints in square brackets (`[Fill in state]`). The
 * brackets are editorial marks, not part of the hint.
 */
export function unbracket(line: string | undefined): string {
  if (!line) return "";
  const match = /\[(.+?)\]/.exec(line);
  return (match ? match[1] : line).trim();
}

/** Helper text from the section's `<label>`. */
export function sectionHint(title: string): string {
  return coverSection(title)?.hint ?? "";
}

/** Placeholder text for a section's nth prose line. */
export function sectionPlaceholder(title: string, index = 0): string {
  return unbracket(coverSection(title)?.body[index]);
}

/** The full wording of a section's nth checkbox option, for tooltips. */
export function sectionChoice(title: string, index: number): string {
  return coverSection(title)?.choices[index] ?? "";
}
