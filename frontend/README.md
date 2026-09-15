# Prelegal frontend

A Next.js app for drafting agreements from the templates in
[`../templates`](../templates). It implements one so far: the
**Mutual NDA** ([PL-3](https://borismujkovic.atlassian.net/browse/PL-3)).

Fill in the cover page, watch the agreement fill in beside it, and download the
result.

## Running it

Normally you run the whole stack — see [`../scripts`](../scripts), which serves
this app from FastAPI at http://localhost:8000. For frontend work alone:

```bash
npm install
npm run dev     # http://localhost:3000
```

`npm run dev` has no backend behind it, so the dashboard and sign-in cannot
reach `/api`. The Mutual NDA creator works regardless — it never talks to a
server.

## Routes

| Route | What it is |
| --- | --- |
| `/` | Redirect: to `/documents` when signed in, `/login` otherwise |
| `/login` | Placeholder sign-in. No password, no security — see below |
| `/documents` | Dashboard, listing everything in `../catalog.json` |
| `/documents/mutual-nda` | The creator |

### It is a static export

`next.config.ts` sets `output: "export"`, so `npm run build` emits plain
HTML/CSS/JS into `out/` and FastAPI serves it. That rules out server-side
features by design — no Server Actions, no Route Handlers reading a request, no
server-side redirects. Anything needing a server belongs in the backend under
`/api`.

It also means the route guard, the `/` redirect and the sign-in state are all
client-side. None of it is a security boundary.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server (regenerates template data first) |
| `npm run build` | Production build (regenerates template data first) |
| `npm run generate:template` | Re-parse `../templates` into `src/lib/nda-template.generated.ts` |
| `npm run lint` | ESLint |
| `npm test` | Vitest, once |
| `npm run test:watch` | Vitest, watching |

Nothing typed into an agreement is sent anywhere — the creator runs entirely in
the browser. The only thing that reaches the backend is the email typed into the
placeholder sign-in.

## How the agreement text gets here

`../templates` is the single source of truth. Its files are verbatim Common
Paper copies and must not be edited by hand, so the app never restates legal
prose — it parses it:

```
templates/mutual-nda.md ──────────┐
templates/mutual-nda-cover-page.md ┴─> scripts/generate-template.mjs
                                          │
                                          v
                              src/lib/nda-template.generated.ts
```

The generated file is committed so the app builds without the templates
directory present, and `predev` / `prebuild` re-run the parser so it cannot
drift from the source. To pull in an upstream template update, update the file
in `../templates` and run `npm run generate:template`.

The parser reads the `<span class="coverpage_link">…</span>` markers as the
substitution points, and derives `SubstitutionField` from the ones it actually
finds. If an upstream revision introduces a new one, the build fails until it is
handled rather than silently rendering a gap.

## Layout

| Path | Role |
| --- | --- |
| `src/lib/nda-fields.ts` | What the user fills in: types, defaults, validation, date formatting |
| `src/lib/substitutions.ts` | Turns cover-page values into clause-ready prose |
| `src/lib/standard-terms.ts` | Tags each substitution point with how many times its field appeared already |
| `src/lib/markdown-export.ts` | The `.md` download |
| `src/lib/cover-page-copy.ts` | Form labels and placeholders, read from the template |
| `src/components/NdaDocument.tsx` | The rendered agreement (also what prints) |
| `src/components/CoverPageForm.tsx` | The form |
| `src/components/DownloadBar.tsx` | Completeness indicator and download actions |
| `src/lib/session.ts` | The placeholder sign-in, and its localStorage |
| `src/lib/catalog.ts` | Catalog types and fetching |
| `src/components/SessionProvider.tsx` | Reads the stored session via `useSyncExternalStore` |
| `src/app/documents/layout.tsx` | The signed-in shell, and the client-side route guard |

### Two ways a value gets substituted

The template uses its substitution markers in two grammatically different ways,
so `substitutions.ts` renders them differently:

- Most are plain noun phrases — "the laws of the State of *{Governing Law}*" —
  and take the value directly.
- **Purpose** and **Effective Date** are *defined terms* introduced by a definite
  article: "in connection with the *{Purpose}*". Substituting the raw value
  yields "in connection with the Evaluating a partnership". These keep the
  defined term and carry the value in parentheses on first use only, the way
  contracts conventionally do it.

### PDF export

There is no PDF library. `globals.css` reduces the page to the document under
`@media print` — hiding the header, form and toolbar, setting `@page` margins,
and controlling pagination — so the browser's own "Save as PDF" is the
generator. The **Download PDF** button just calls `window.print()`.

## Tests

```bash
npm test
```

| Path | What it covers |
| --- | --- |
| `test/nda-fields.test.ts` | Date formatting, year validation, completeness checking |
| `test/substitutions.test.ts` | Every substitution point, filled and unfilled, in both wordings |
| `test/standard-terms.test.ts` | Occurrence numbering, so a defined term expands exactly once |
| `test/markdown-export.test.ts` | Export structure, markdown escaping, filenames, full-document snapshots |
| `test/session.test.ts` | Session storage, its failure modes, and change notification |
| `test/catalog.test.ts` | The shipped `catalog.json`, including that every template path exists |
| `test/components/` | The form, the document, the download bar, the shell, login, dashboard, and the page wiring them together |
| `test/parity.test.tsx` | The on-screen document and the `.md` export agree, case by case |

The pure-logic suites run in Vitest's `node` environment; component suites opt
into jsdom with a `@vitest-environment jsdom` docblock, which keeps the fast
suites fast.

`test/parity.test.tsx` is the one worth understanding: `NdaDocument.tsx` and
`markdown-export.ts` are two independent renderers over the same template data,
and nothing but these tests stops one from drifting from the other.

### What tests cannot cover here

The PDF is produced by the browser's print engine, so pagination, `@page`
margins and how the print stylesheet actually lands on Letter or A4 are only
verifiable by printing the page in a real browser. Treat a change to the
`@media print` block in `globals.css` as needing a manual print-preview check.

[`test/MANUAL.md`](test/MANUAL.md) is the checklist for that, plus real
downloads, keyboard access and cross-browser printing.

## Licence

Generated documents are derivative works of the Common Paper templates, which
are [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The attribution
is rendered into the document and into the `.md` export, and must stay there —
see [`../templates/README.md`](../templates/README.md).
