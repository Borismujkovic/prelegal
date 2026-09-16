/**
 * Parses the Common Paper Standard Terms that ship without a cover page.
 *
 * `scripts/generate-template.mjs` handles the Mutual NDA, whose upstream
 * markdown is a different grammar entirely: flat `N. **Heading**. Body` lines, a
 * real cover page with `###` sections, and a closing CC BY line. The other
 * agreements are nested ordered lists whose numbering lives in
 * `<span class="header_2">` / `header_3` markup, and they carry no licence line
 * at all. Rather than teach one parser both grammars and put the NDA — which is
 * covered by a parity suite and already shipping — at risk, this is a second
 * parser for the second grammar.
 *
 * Pure functions only, so the tests can exercise them against hand-written
 * snippets with no filesystem involved.
 */

/** The span classes Common Paper uses to mark a deal-specific value. */
export const FIELD_SPAN_CLASSES = [
  "coverpage",
  "keyterms",
  "orderform",
  "businessterms",
  "sow",
];

/**
 * Every class is matched, never just the one a document is nominally filed
 * under. The SLA mixes `orderform_link` and `coverpage_link` in the same file,
 * so filtering by a single declared tier would silently drop half its fields.
 */
const FIELD_SPAN_SOURCE = `<span class="(?:${FIELD_SPAN_CLASSES.join("|")})_link"[^>]*>(.+?)<\\/span>`;

/**
 * A clause heading. The id is optional: the Pilot Agreement and the SLA carry
 * `id="1.1"`, the BAA and the Design Partner Agreement omit it entirely.
 */
const HEADING_RE = /^<span class="header_[23]"[^>]*>(.*?)<\/span>\s*(.*)$/;

/**
 * Numbering-only spans, in both shapes that occur: `<span id="4.1"></span>`
 * before the text, and `<span id="4.1">**"Term"**</span>` around it. Neither
 * carries a class, which is exactly what distinguishes them from the spans
 * above — so this can never swallow a field.
 */
const TRANSPARENT_SPAN_RE = /<span id="[^"]*">(.*?)<\/span>/g;

const NUMBERED_MARKER_RE = /^(\d+)\.\s+/;
const LETTERED_MARKER_RE = /^([a-z])\.\s+/;

/**
 * Collapses a span's text to the field it names.
 *
 * The templates inflect these in running prose — `Provider` and `Provider's`
 * are one value, and both straight and curly apostrophes occur upstream — so
 * without this the AI Addendum would appear to have seven fields rather than
 * six and no overlay could ever match it.
 */
export function normaliseFieldName(raw) {
  return raw.trim().replace(/['’]s$/, "").trim();
}

/** Drops the numbering-only spans, which carry nothing worth rendering. */
export function unwrapTransparentSpans(line) {
  return line.replace(TRANSPARENT_SPAN_RE, "$1");
}

/**
 * Splits a line into renderable segments, preserving field spans, bold runs and
 * links.
 *
 * A bold run holds nested segments rather than a flat string, because these
 * templates put fields *inside* bold: the Pilot Agreement's liability cap is
 * `**...the <span class="orderform_link">General Cap Amount</span>.**`. Matching
 * bold as a flat run would start earlier in the line, swallow the span whole,
 * and lose the field — it would render as literal HTML and could never be
 * filled in. The Mutual NDA's generator has no such case, which is why its
 * simpler flat `strong` segment is fine there and not here.
 */
export function tokenize(markdown) {
  const pattern = new RegExp(
    `${FIELD_SPAN_SOURCE}|\\*\\*(.+?)\\*\\*|\\[(.+?)\\]\\((.+?)\\)`,
    "g",
  );
  const segments = [];
  let cursor = 0;

  for (const match of markdown.matchAll(pattern)) {
    if (match.index > cursor) {
      segments.push({ kind: "text", value: markdown.slice(cursor, match.index) });
    }
    const [full, field, strong, linkText, href] = match;
    if (field !== undefined) {
      segments.push({ kind: "field", field: normaliseFieldName(field) });
    } else if (strong !== undefined) {
      segments.push({ kind: "strong", segments: tokenize(strong) });
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

/** Strips inline markup that carries no meaning for a heading. */
export function plainText(markdown) {
  return unwrapTransparentSpans(markdown)
    .replace(/<span class="[a-z_]*_link"[^>]*>(.+?)<\/span>/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1")
    .trim();
}

/**
 * Parses one Standard Terms file into a title and a flat list of clause nodes.
 *
 * The list is flat, but every node carries its `depth`, so a renderer can
 * rebuild real nested `<ol>` elements and let the browser do the numbering.
 * Storing composite numbers like "3.2.a" instead would bake one presentation
 * into the data and oblige the markdown export to reproduce it exactly.
 */
export function parseStandardTerms(markdown, source = "the template") {
  const lines = markdown.split(/\r?\n/);
  let title = "";
  const nodes = [];

  for (const [index, rawLine] of lines.entries()) {
    if (!rawLine.trim()) continue;
    const where = `${source} line ${index + 1}`;

    if (rawLine.startsWith("# ")) {
      title = plainText(rawLine.slice(2));
      continue;
    }

    const indent = rawLine.length - rawLine.trimStart().length;
    if (indent % 4 !== 0 || indent > 8) {
      throw new Error(`Unexpected indentation of ${indent} spaces at ${where}`);
    }
    const depth = indent / 4;

    const line = unwrapTransparentSpans(rawLine.trim());
    const marker = depth === 2 ? LETTERED_MARKER_RE : NUMBERED_MARKER_RE;
    const withoutMarker = line.replace(marker, "");
    if (withoutMarker === line) {
      throw new Error(`Expected a list marker at ${where}: ${line.slice(0, 60)}`);
    }

    // A clause either leads with its heading span or is a bare sentence. The
    // Design Partner Agreement's fees clause is one of the latter.
    const heading = HEADING_RE.exec(withoutMarker);
    nodes.push(
      heading
        ? { depth, heading: plainText(heading[1]), body: tokenize(heading[2]) }
        : { depth, heading: null, body: tokenize(withoutMarker) },
    );
  }

  if (!title) throw new Error(`No '# ' title found in ${source}`);
  if (nodes.length === 0) throw new Error(`No clauses found in ${source}`);
  return { title, nodes };
}

/**
 * Walks segments depth-first, descending into bold runs.
 *
 * Anything that counts fields has to use this rather than a flat loop, or a
 * field nested inside bold goes uncounted — which is the whole reason `strong`
 * carries segments.
 */
export function* eachSegment(segments) {
  for (const segment of segments) {
    yield segment;
    if (segment.kind === "strong") yield* eachSegment(segment.segments);
  }
}

/** Every distinct field the Standard Terms substitute, in first-use order. */
export function deriveFieldNames(nodes) {
  const seen = [];
  for (const node of nodes) {
    for (const segment of eachSegment(node.body)) {
      if (segment.kind === "field" && !seen.includes(segment.field)) {
        seen.push(segment.field);
      }
    }
  }
  return seen;
}

/** Every field name an overlay accounts for, however it accounts for it. */
export function describedFieldNames(overlay) {
  return [
    overlay.parties.a.field,
    overlay.parties.b.field,
    ...(overlay.derived ?? []).map((entry) => entry.field),
    ...overlay.sections.flatMap((section) =>
      section.fields.map((field) => field.field),
    ),
  ];
}

/**
 * Checks an overlay against the template it describes, in both directions.
 *
 * This is what stands in for the Mutual NDA's compile-time exhaustiveness.
 * There, a new upstream substitution point widened a union and broke every
 * `switch` that did not handle it. Here the fields are data, so nothing would
 * break — the new field would quietly render as a placeholder no one could ever
 * fill in, and a stale one would sit in the form filling nothing. Failing the
 * build keeps that guarantee; it just moves it to generate time.
 */
export function validateOverlay(overlay, derivedFields, source) {
  const described = describedFieldNames(overlay);

  const duplicate = described.find(
    (name, index) => described.indexOf(name) !== index,
  );
  if (duplicate) {
    throw new Error(`${source} describes "${duplicate}" more than once`);
  }

  for (const name of derivedFields) {
    if (!described.includes(name)) {
      throw new Error(
        `${source} does not describe the field "${name}", which its Standard Terms substitute`,
      );
    }
  }
  for (const name of described) {
    if (!derivedFields.includes(name)) {
      throw new Error(
        `${source} describes the field "${name}", which its Standard Terms never substitute`,
      );
    }
  }

  for (const section of overlay.sections) {
    for (const field of section.fields) {
      if (!/^[a-z][A-Za-z0-9]*$/.test(field.id)) {
        throw new Error(`${source} has a field id that is not camelCase: ${field.id}`);
      }
    }
  }
  return true;
}
