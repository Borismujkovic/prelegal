"use client";

/**
 * The agreement itself, as it will be signed and as it will be printed.
 *
 * This is literally the print target: `globals.css` hides everything else when
 * the browser prints, which is what "Download PDF" does.
 *
 * Clauses arrive as a flat list carrying their depth, and the nesting is
 * rebuilt here into real `<ol>` elements so the browser does the numbering.
 * Composite numbers like "3.2.a" are never stored, which means the markdown
 * export is free to number its own way without having to agree character for
 * character.
 *
 * Every value is rendered as a React child, never as HTML, so nothing a user
 * types can become markup.
 */
import { Fragment } from "react";
import { renderField } from "@/lib/generic/field-values";
import type {
  ClauseNode,
  GeneratedDocument,
  GenericSegment,
  GenericValues,
  Party,
} from "@/lib/generic/types";

type TreeNode = { clause: ClauseNode; children: TreeNode[] };

/** Rebuilds the nesting the flat list encodes in `depth`. */
export function toTree(clauses: readonly ClauseNode[]): TreeNode[] {
  const roots: TreeNode[] = [];
  const stack: TreeNode[] = [];

  for (const clause of clauses) {
    const node: TreeNode = { clause, children: [] };
    stack.length = clause.depth;
    const parent = stack[clause.depth - 1];
    if (parent) parent.children.push(node);
    else roots.push(node);
    stack[clause.depth] = node;
  }
  return roots;
}

function Placeholder({ children }: { children: string }) {
  return (
    <mark className="rounded bg-amber-100 px-1 text-amber-900 print:bg-transparent print:text-black">
      [{children}]
    </mark>
  );
}

function Segments({
  segments,
  document: agreement,
  values,
}: {
  segments: readonly GenericSegment[];
  document: GeneratedDocument;
  values: GenericValues;
}) {
  return (
    <>
      {segments.map((segment, index) => {
        switch (segment.kind) {
          case "text":
            return <Fragment key={index}>{segment.value}</Fragment>;
          case "strong":
            return (
              <strong key={index} className="font-semibold">
                <Segments
                  segments={segment.segments}
                  document={agreement}
                  values={values}
                />
              </strong>
            );
          case "link":
            return (
              <a
                key={index}
                href={segment.href}
                className="text-brand-blue underline underline-offset-2"
              >
                {segment.value}
              </a>
            );
          case "field": {
            const resolved = renderField(
              agreement,
              values,
              segment.field,
              segment.occurrence,
            );
            switch (resolved.kind) {
              case "placeholder":
                return <Placeholder key={index}>{resolved.term}</Placeholder>;
              case "term":
                return (
                  <span key={index} className="font-semibold">
                    {resolved.term}
                  </span>
                );
              case "termWithValue":
                return (
                  <span key={index} className="font-semibold">
                    {resolved.term} ({resolved.value})
                  </span>
                );
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
      })}
    </>
  );
}

const MARKERS = ["list-decimal", "list-decimal", "list-[lower-alpha]"];

function Clauses({
  nodes,
  depth,
  document: agreement,
  values,
}: {
  nodes: TreeNode[];
  depth: number;
  document: GeneratedDocument;
  values: GenericValues;
}) {
  return (
    <ol
      className={`space-y-3 ${MARKERS[depth] ?? "list-decimal"} ${
        depth === 0 ? "ml-5" : "mt-3 ml-6"
      }`}
    >
      {nodes.map((node, index) => (
        <li key={index} className="break-inside-avoid pl-1">
          {node.clause.heading ? (
            <span className="font-semibold text-navy">
              {node.clause.heading}{" "}
            </span>
          ) : null}
          <Segments
            segments={node.clause.body}
            document={agreement}
            values={values}
          />
          {node.children.length > 0 ? (
            <Clauses
              nodes={node.children}
              depth={depth + 1}
              document={agreement}
              values={values}
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

const SIGNATURE_ROWS: { label: string; key: keyof Party }[] = [
  { label: "Company", key: "company" },
  { label: "Print name", key: "name" },
  { label: "Title", key: "title" },
  { label: "Notice address", key: "noticeAddress" },
];

function Signatures({
  document: agreement,
  values,
}: {
  document: GeneratedDocument;
  values: GenericValues;
}) {
  const columns: [string, Party][] = [
    [agreement.parties.a.label, values.party1],
    [agreement.parties.b.label, values.party2],
  ];

  return (
    <section className="mt-10 break-inside-avoid">
      <p className="mb-4 text-sm">
        By signing below, each party agrees to enter into this agreement.
      </p>
      <div className="grid gap-6 sm:grid-cols-2">
        {columns.map(([label, party]) => (
          <div key={label} className="space-y-2">
            <h3 className="text-sm font-semibold tracking-wide text-navy uppercase">
              {label}
            </h3>
            {SIGNATURE_ROWS.map((row) => (
              <p key={row.key} className="text-sm">
                <span className="text-brand-gray">{row.label}: </span>
                {party[row.key].trim() ? (
                  party[row.key]
                ) : (
                  <span className="text-brand-gray">—</span>
                )}
              </p>
            ))}
            <p className="border-t border-slate-300 pt-6 text-sm text-brand-gray">
              Signature and date
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function GenericDocument({
  document: agreement,
  values,
}: {
  document: GeneratedDocument;
  values: GenericValues;
}) {
  return (
    <article className="font-serif text-sm leading-relaxed text-slate-900">
      <h1 className="mb-2 text-2xl font-semibold text-navy">
        {agreement.title}
      </h1>
      {agreement.attachesTo ? (
        <p className="mb-6 text-sm text-brand-gray">
          Attaches to, and forms part of, the parties&rsquo; existing agreement.
        </p>
      ) : null}

      <Clauses
        nodes={toTree(agreement.clauses)}
        depth={0}
        document={agreement}
        values={values}
      />

      <Signatures document={agreement} values={values} />

      <footer className="mt-10 border-t border-slate-200 pt-4 text-xs text-brand-gray">
        {agreement.attribution}
      </footer>
    </article>
  );
}
