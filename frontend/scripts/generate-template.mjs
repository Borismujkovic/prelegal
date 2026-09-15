/**
 * Generates `src/lib/nda-template.generated.ts` from the verbatim Common Paper
 * templates in `<repo>/templates`.
 *
 * `templates/` is the single source of truth for agreement text (see
 * templates/README.md — the files are verbatim upstream copies and must not be
 * edited by hand). This script parses them into typed data so the app never
 * restates the legal text itself.
 *
 * Runs automatically via the `prebuild` npm script. If the templates directory
 * is unavailable (e.g. the frontend is built in isolation) the existing
 * generated file is left in place.
 */
import { readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(SCRIPT_DIR, "../../templates");
const OUTPUT_FILE = path.resolve(SCRIPT_DIR, "../src/lib/nda-template.generated.ts");

/** `1. **Heading**. Body text...` — one numbered clause of the Standard Terms. */
const CLAUSE_RE = /^(\d+)\.\s+\*\*(.+?)\*\*\.\s*(.*)$/;
/** Cover Page section headings and their `<label>` helper text. */
const SECTION_RE = /^###\s+(.+?)\s*$/;
const LABEL_RE = /^<label>(.*)<\/label>$/;
/** `- [x] option text` / `- [ ] option text` — a selectable Cover Page choice. */
const CHOICE_RE = /^-\s+\[([ xX])\]\s+(.*)$/;

/**
 * Splits markdown into renderable segments, preserving the three constructs the
 * templates rely on: bold runs, links, and `coverpage_link` spans. The spans are
 * the substitution points a document generator must target.
 */
function tokenize(markdown) {
  const pattern =
    /<span class="coverpage_link">(.+?)<\/span>|\*\*(.+?)\*\*|\[(.+?)\]\((.+?)\)/g;
  const segments = [];
  let cursor = 0;

  for (const match of markdown.matchAll(pattern)) {
    if (match.index > cursor) {
      segments.push({ kind: "text", value: markdown.slice(cursor, match.index) });
    }
    const [full, field, strong, linkText, href] = match;
    if (field !== undefined) {
      segments.push({ kind: "field", field });
    } else if (strong !== undefined) {
      segments.push({ kind: "strong", value: strong });
    } else {
      segments.push({ kind: "link", value: linkText, href });
    }
    cursor = match.index + full.length;
  }

  if (cursor < markdown.length) {
    segments.push({ kind: "text", value: markdown.slice(cursor) });
  }
  return segments;
}

/** Strips inline markdown that carries no meaning for a form label. */
function plainText(markdown) {
  return markdown
    .replace(/<span class="coverpage_link">(.+?)<\/span>/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1")
    .trim();
}

function parseStandardTerms(markdown) {
  const lines = markdown.split(/\r?\n/);
  const clauses = [];
  let attribution = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const clause = CLAUSE_RE.exec(trimmed);
    if (clause) {
      clauses.push({
        number: Number(clause[1]),
        heading: clause[2],
        body: tokenize(clause[3]),
      });
      continue;
    }
    // The closing line is the CC BY attribution, which must travel with any
    // document generated from these templates. Kept as segments so the licence
    // link survives into the rendered document and the export.
    if (trimmed.startsWith("Common Paper")) {
      attribution = tokenize(trimmed);
    }
  }

  if (clauses.length === 0) {
    throw new Error("No numbered clauses found in mutual-nda.md");
  }
  if (attribution.length === 0) {
    throw new Error("No attribution line found in mutual-nda.md");
  }
  return { clauses, attribution };
}

function parseCoverPage(markdown) {
  const lines = markdown.split(/\r?\n/);

  let title = "";
  let preambleHeading = "";
  const preamble = [];
  const sections = [];
  let signatureIntro = "";
  let attribution = [];
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("# ")) {
      title = plainText(trimmed.slice(2));
      continue;
    }
    if (trimmed.startsWith("## ")) {
      preambleHeading = plainText(trimmed.slice(3));
      continue;
    }

    const heading = SECTION_RE.exec(trimmed);
    if (heading) {
      current = { title: heading[1], hint: "", choices: [], body: [] };
      sections.push(current);
      continue;
    }

    // These closing lines belong to the Cover Page as a whole, not to whichever
    // `###` section happens to precede them.
    if (trimmed.startsWith("By signing this Cover Page")) {
      signatureIntro = plainText(trimmed);
      current = null;
      continue;
    }
    if (trimmed.startsWith("Common Paper")) {
      attribution = tokenize(trimmed);
      current = null;
      continue;
    }
    // The signature table is rebuilt from the user's party details.
    if (trimmed.startsWith("|")) continue;

    if (!current) {
      if (preambleHeading) preamble.push(...tokenize(trimmed));
      continue;
    }

    const label = LABEL_RE.exec(trimmed);
    if (label) {
      current.hint = plainText(label[1]);
      continue;
    }
    const choice = CHOICE_RE.exec(trimmed);
    if (choice) {
      current.choices.push(plainText(choice[2]));
      continue;
    }
    current.body.push(plainText(trimmed));
  }

  if (sections.length === 0) {
    throw new Error("No `###` sections found in mutual-nda-cover-page.md");
  }
  if (!title || !signatureIntro || attribution.length === 0) {
    throw new Error("Cover Page is missing its title, signature intro, or attribution");
  }
  return { title, preambleHeading, preamble, sections, signatureIntro, attribution };
}

function render({ clauses, termsAttribution, cover, fields }) {
  const union = fields.map((field) => JSON.stringify(field)).join(" | ");
  const titleUnion = cover.sections
    .map((section) => JSON.stringify(section.title))
    .join(" | ");
  const json = (value) => JSON.stringify(value, null, 2);

  return `// Generated by scripts/generate-template.mjs — do not edit by hand.
// Source: templates/mutual-nda.md and templates/mutual-nda-cover-page.md
// (verbatim Common Paper copies). Run \`npm run generate:template\` to refresh.

/**
 * The Cover Page values referenced from the Standard Terms via
 * \`<span class="coverpage_link">\`. Derived from the template itself, so a new
 * upstream substitution point becomes a compile error until it is handled.
 */
export type SubstitutionField = ${union};

export type TemplateSegment =
  | { kind: "text"; value: string }
  | { kind: "strong"; value: string }
  | { kind: "link"; value: string; href: string }
  | { kind: "field"; field: SubstitutionField };

export type TemplateClause = {
  number: number;
  heading: string;
  body: readonly TemplateSegment[];
};

/**
 * The Cover Page's sections, as a union rather than \`string\`. Renderers switch
 * on this exhaustively, so an upstream template that adds or renames a section
 * breaks the build instead of silently rendering a blank section.
 */
export type CoverPageSectionTitle = ${titleUnion};

export type CoverPageSection = {
  title: CoverPageSectionTitle;
  /** Helper text from the template's \`<label>\`, if any. */
  hint: string;
  /** Selectable options for sections the template renders as checkboxes. */
  choices: readonly string[];
  /** Remaining prose lines, used as form placeholders. */
  body: readonly string[];
};

/** The 11 numbered clauses of the Mutual NDA Standard Terms. */
export const STANDARD_TERMS: readonly TemplateClause[] = ${json(clauses)};

/**
 * CC BY 4.0 attribution from the Standard Terms — must accompany every document.
 * Kept as segments so the licence link survives into the output.
 */
export const STANDARD_TERMS_ATTRIBUTION: readonly TemplateSegment[] = ${json(termsAttribution)};

export const COVER_PAGE_TITLE = ${JSON.stringify(cover.title)};

export const COVER_PAGE_PREAMBLE_HEADING = ${JSON.stringify(cover.preambleHeading)};

/** The explanatory paragraph introducing how to use the MNDA. */
export const COVER_PAGE_PREAMBLE: readonly TemplateSegment[] = ${json(cover.preamble)};

/** Section titles, helper text and options as worded on the Cover Page. */
export const COVER_PAGE_SECTIONS: readonly CoverPageSection[] = ${json(cover.sections)};

export const COVER_PAGE_SIGNATURE_INTRO = ${JSON.stringify(cover.signatureIntro)};

/** CC BY 4.0 attribution from the Cover Page. */
export const COVER_PAGE_ATTRIBUTION: readonly TemplateSegment[] = ${json(cover.attribution)};
`;
}

async function main() {
  try {
    await access(TEMPLATES_DIR);
  } catch {
    console.warn(
      `[generate-template] ${TEMPLATES_DIR} not found; keeping the committed generated file.`,
    );
    return;
  }

  const [termsMd, coverMd] = await Promise.all([
    readFile(path.join(TEMPLATES_DIR, "mutual-nda.md"), "utf8"),
    readFile(path.join(TEMPLATES_DIR, "mutual-nda-cover-page.md"), "utf8"),
  ]);

  const { clauses, attribution: termsAttribution } = parseStandardTerms(termsMd);
  const cover = parseCoverPage(coverMd);

  const fields = [
    ...new Set(
      clauses.flatMap((clause) =>
        clause.body.filter((s) => s.kind === "field").map((s) => s.field),
      ),
    ),
  ].sort();

  await writeFile(
    OUTPUT_FILE,
    render({ clauses, termsAttribution, cover, fields }),
    "utf8",
  );
  console.log(
    `[generate-template] Wrote ${clauses.length} clauses, ${cover.sections.length} cover-page sections, ${fields.length} substitution fields.`,
  );
}

await main();
