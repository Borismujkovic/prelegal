# Manual test plan

Everything here needs a real browser. The automated suite (`npm test`) covers
the substitution logic, both renderers and the form; what it cannot cover is the
part of this app that *is* a browser feature — the print engine that produces
the PDF — plus real file downloads and real typography.

Run this before releasing, and after any change to the `@media print` block in
`src/app/globals.css` or to `NdaDocument.tsx`.

```bash
npm run dev   # http://localhost:3000
```

## 1. The PDF is the product — check it at both paper sizes

The **Download PDF** button calls `window.print()`. There is no PDF library, so
the print stylesheet is the generator and paper size is the user's, not ours.

Fill the cover page completely first (see fixture below), then open the print
preview (Ctrl/Cmd-P) and check, **at Letter and again at A4**:

| # | Check | Why it matters |
| --- | --- | --- |
| 1.1 | No part of the form, shell header (Prelegal / user / Sign out) or download toolbar appears | They are `print:hidden`; a regression here leaks app chrome into the agreement. The header moved to `src/app/documents/layout.tsx` in PL-4, so check it there |
| 1.2 | The whole agreement is present — scroll to the last page and confirm clause 11 and the closing attribution are there, not truncated | A scroll or sticky container clipping the document would silently cut the contract short |
| 1.3 | "Standard Terms" starts on a fresh page | `break-before-page` on that section |
| 1.4 | Neither signature block is split across a page boundary | `break-inside-avoid`; a signature block split in half is not signable |
| 1.5 | No heading is stranded at the foot of a page | `break-after: avoid` on h1/h2/h3 |
| 1.6 | No single line of a clause stranded alone at the top or bottom of a page | `orphans`/`widows: 3` |
| 1.7 | Margins look even and nothing runs into them | `@page { margin: 18mm 16mm }` |
| 1.8 | Body text is comfortably readable (target ~10.5pt) | `article { font-size: 10.5pt }` |
| 1.9 | The CC BY 4.0 attribution appears **twice** — after the cover page and after the Standard Terms | Licence requirement; see `../templates/README.md` |

### 1.10 Attribution links on paper

Print rules strip link colour and underline, so the two "CC BY 4.0" links render
as plain text and **the URL is not printed**. Confirm a reader of the paper copy
can still identify the licence from the text alone. If not, the print stylesheet
needs to print the href.

### 1.11 Outstanding values on paper

With a deliberately **incomplete** cover page, print again. On screen an unfilled
value is highlighted amber; in print that highlight is removed on purpose, so the
only remaining signal is the literal brackets, e.g. `[Purpose]`. Confirm those
brackets are clearly visible in the PDF — they are the sole warning that someone
is about to sign an incomplete agreement.

## 2. Downloads

| # | Check |
| --- | --- |
| 2.1 | **Download .md** saves a file named `mutual-nda-<party1>-<party2>.md` |
| 2.2 | With no company names filled in, the file is named `mutual-nda.md` |
| 2.3 | Opening the `.md` in a markdown viewer shows a well-formed document: headings nested correctly, the signature table rendering as a table, no stray backslashes in ordinary prose |
| 2.4 | The `.md` and the PDF say the same thing — spot-check Purpose, Effective Date, both terms, governing law and jurisdiction |

## 3. Adversarial input

Type each of these into **Purpose** and then into **Modifications**, and confirm
the on-screen document and the downloaded `.md` both render it as literal text:

- `*bold* _italic_ ` and a backtick: `` `code` ``
- `[link](https://example.com)`
- `<script>alert(1)</script>`
- `| pipe | table | breaker |` — put this in a **Company** field and confirm the
  signature table in the `.md` keeps its shape
- A multi-line **Notice address** — confirm it stays on one table row in the `.md`
- A very long Purpose (a full paragraph) — confirm clause 1 still reads correctly
  and the PDF paginates around it

## 4. Browsers

The print engine differs per browser; 1.2–1.8 are the checks that actually vary.

| Browser | Print check | Download check |
| --- | --- | --- |
| Chrome | | |
| Firefox | | |
| Safari | | |
| Edge | | |

## 5. Keyboard and screen reader

| # | Check |
| --- | --- |
| 5.1 | Tab reaches every field in a sensible order and nothing is focus-trapped |
| 5.2 | The focus ring is visible on every control, including the radios and the number inputs |
| 5.3 | Both radio groups are operable with arrow keys |
| 5.4 | The "N fields still to fill" toggle is reachable and its expanded state is announced |
| 5.5 | With a screen reader, the two "Number of years" inputs are distinguishable — they share an `aria-label` and sit in different sections |

## 6. Responsive

| # | Check |
| --- | --- |
| 6.1 | Below `lg`, the form and the document stack rather than overlap |
| 6.2 | At `lg` and above, the form scrolls independently and stays put while the document scrolls |
| 6.3 | On a narrow phone viewport the document is readable and nothing overflows horizontally |

## Fixture — a complete cover page

Use these values so results are comparable between runs; they match `COMPLETE` in
`test/fixtures.ts`, so the automated snapshot is the reference for what the text
should say.

| Field | Value |
| --- | --- |
| Purpose | Evaluating a potential partnership. |
| Effective date | 2026-03-09 |
| MNDA term | Expires 2 years |
| Term of confidentiality | 3 years |
| Governing law | Delaware |
| Jurisdiction | New Castle, DE |
| Party 1 | Jane Doe / Chief Executive Officer / Acme, Inc. / legal@acme.com |
| Party 2 | John Roe / Chief Technology Officer / Globex LLC / legal@globex.com |
