/**
 * The same document, as markdown.
 *
 * A second renderer over the same data as `GenericDocument.tsx`, which is a
 * risk: two renderers can drift. `test/generic/parity.test.tsx` is what stops
 * that, checking every document's resolved values appear in both.
 *
 * Numbering is recomputed here rather than read from the source, because the
 * clause data deliberately stores depth rather than composite numbers like
 * "3.2.a". Markdown needs an explicit marker where HTML lets the browser count,
 * so each renderer numbers in the way its own format wants.
 */
import { renderField } from "./field-values";
import type {
  ClauseNode,
  GeneratedDocument,
  GenericSegment,
  GenericValues,
  Party,
} from "./types";

/**
 * Escapes markdown that would otherwise change the structure of the document.
 *
 * Only ever applied to what a user typed. The template's own text is trusted —
 * it is verbatim Common Paper, and escaping it would break its own emphasis.
 */
function escapeInline(value: string): string {
  return value.replace(/([\\`*_[\]])/g, "\\$1");
}

/** Also neutralises markers that would start a list or heading of their own. */
function escapeBlock(value: string): string {
  return escapeInline(value)
    .split("\n")
    .map((line) => line.replace(/^(\s*)([#>+-]|\d+\.)/, "$1\\$2"))
    .join("\n");
}

function renderSegments(
  segments: readonly GenericSegment[],
  document: GeneratedDocument,
  values: GenericValues,
): string {
  return segments
    .map((segment) => {
      switch (segment.kind) {
        case "text":
          return segment.value;
        case "strong":
          return `**${renderSegments(segment.segments, document, values)}**`;
        case "link":
          return `[${segment.value}](${segment.href})`;
        case "field": {
          const resolved = renderField(
            document,
            values,
            segment.field,
            segment.occurrence,
          );
          switch (resolved.kind) {
            case "placeholder":
              // Left as a literal bracket so an unfilled gap is visible in the
              // export exactly as it is on screen.
              return `[${resolved.term}]`;
            case "term":
              return `**${resolved.term}**`;
            case "termWithValue":
              return `**${resolved.term}** (${escapeInline(resolved.value)})`;
            default: {
              const unhandled: never = resolved;
              throw new Error(`Unhandled render: ${String(unhandled)}`);
            }
          }
        }
        default: {
          const unhandled: never = segment;
          throw new Error(`Unhandled segment: ${String(unhandled)}`);
        }
      }
    })
    .join("");
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

function renderClauses(
  clauses: readonly ClauseNode[],
  document: GeneratedDocument,
  values: GenericValues,
): string[] {
  // One counter per depth. Entering a shallower level resets everything below
  // it, which is what restarts lettering inside each new parent clause.
  const counters = [0, 0, 0];
  const lines: string[] = [];

  for (const clause of clauses) {
    counters[clause.depth] += 1;
    for (let deeper = clause.depth + 1; deeper < counters.length; deeper += 1) {
      counters[deeper] = 0;
    }

    const marker =
      clause.depth === 2
        ? `${LETTERS[(counters[2] - 1) % LETTERS.length]}.`
        : `${counters[clause.depth]}.`;
    const heading = clause.heading ? `**${clause.heading}** ` : "";
    const body = renderSegments(clause.body, document, values);

    lines.push(`${"    ".repeat(clause.depth)}${marker} ${heading}${body}`);
  }
  return lines;
}

function renderSignatures(
  document: GeneratedDocument,
  values: GenericValues,
): string[] {
  const columns: [string, Party][] = [
    [document.parties.a.label, values.party1],
    [document.parties.b.label, values.party2],
  ];

  const lines = [
    "## Signatures",
    "",
    "By signing below, each party agrees to enter into this agreement.",
    "",
  ];

  for (const [label, party] of columns) {
    lines.push(`### ${label}`, "");
    for (const [name, value] of [
      ["Company", party.company],
      ["Print name", party.name],
      ["Title", party.title],
      ["Notice address", party.noticeAddress],
    ] as const) {
      lines.push(`- ${name}: ${value.trim() ? escapeBlock(value) : "—"}`);
    }
    lines.push("- Signature: ______________________", "- Date: ______________________", "");
  }
  return lines;
}

export function buildMarkdown(
  document: GeneratedDocument,
  values: GenericValues,
): string {
  return [
    `# ${document.title}`,
    "",
    ...renderClauses(document.clauses, document, values),
    "",
    ...renderSignatures(document, values),
    "---",
    "",
    document.attribution,
    "",
  ].join("\n");
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildFilename(
  document: GeneratedDocument,
  values: GenericValues,
): string {
  const parties = [values.party1.company, values.party2.company]
    .map((company) => slug(company))
    .filter(Boolean);

  return parties.length === 2
    ? `${document.id}-${parties[0]}-${parties[1]}.md`
    : `${document.id}.md`;
}
