# Cover page overlays

The part Common Paper did not publish.

## Why this directory exists

A Common Paper agreement comes in two halves: boilerplate **Standard Terms**,
and a short **Cover Page** (sometimes called Key Terms, an Order Form, or a
Statement of Work) carrying the deal-specific values. The Standard Terms name
those values inline, wrapped in spans:

```html
During the <span class="orderform_link">Pilot Period</span> and subject to…
```

Upstream publishes both halves for the Mutual NDA alone. For every other
agreement only the Standard Terms exist — so the half a user actually fills in
was missing, which is what made those documents undraftable.

These files are that missing half. They are **ours, not Common Paper's**:
`templates/` stays a verbatim copy and is never edited, per
[`templates/README.md`](../templates/README.md). What we add here is a label, a
hint, a field type and a grouping for each value the Standard Terms already
name. We are not writing contract language; we are describing a form.

## Read by both sides

| Reader | When | For |
| --- | --- | --- |
| `frontend/scripts/generate-documents.mjs` | build time | the form, and the rendered document |
| `backend/src/prelegal/document_specs.py` | runtime | the assistant's prompt, and the chat's response schema |

JSON rather than TypeScript or Python precisely so both can read it without a
build step. The labels are written once; a wording change reaches the form and
the assistant together. Anything explanatory goes in a `note` key, since JSON
has no comments.

## Shape

```jsonc
{
  "id": "pilot-agreement",          // must match the catalog.json entry
  "tier": "Order Form",             // what Common Paper calls this exhibit
  "note": "…",
  "parties": {                      // the two role names, filled from the
    "a": { "field": "Provider",     // signature block rather than asked for
           "label": "Provider" },   // separately
    "b": { "field": "Customer", "label": "Customer" }
  },
  "derived": [                      // named by the terms, but collected
    { "field": "Notice Address",    // elsewhere — nobody types an address twice
      "from": "partyNoticeAddress" }
  ],
  "sections": [
    {
      "title": "The pilot",
      "hint": "",
      "fields": [
        {
          "field": "Pilot Period",  // exactly as the span spells it
          "id": "pilotPeriod",      // camelCase; this is the wire format
          "type": "text",           // text | textarea | date
          "label": "Pilot period",
          "hint": "How long the customer may evaluate the product.",
          "placeholder": "90 days from the Effective Date",
          "optional": false
        }
      ]
    }
  ]
}
```

`field` must match the span text after possessives are stripped — `Provider`
and `Provider's` are one value.

## The overlay must account for every term, and invent none

Both generators check this, in both directions, and refuse to build otherwise:

- a term the Standard Terms substitute but the overlay never describes would
  render as a placeholder nobody could ever fill in;
- a term the overlay describes but the Standard Terms never use would put a
  field on the form that fills nothing — worse, because it looks like it worked.

This is what replaces the compile-time exhaustiveness the Mutual NDA gets from
its generated union types. There, a new upstream substitution point broke every
renderer that did not handle it. Here the fields are data, so nothing would
break on its own; failing the build restores the guarantee one phase earlier.
`backend/tests/test_document_specs.py` asserts the same invariant independently.

## Adding a document

1. Confirm the fields:
   `grep -o '<span class="[a-z_]*_link">[^<]*</span>' templates/<id>.md | sort -u`
2. Write `cover-pages/<id>.json`.
3. Add the id to `DOCUMENT_IDS` in `frontend/scripts/generate-documents.mjs`.
4. Flip `available` to `true` in `catalog.json`.
5. Run `npm run generate:documents` — it fails loudly until the overlay and the
   template agree exactly.
6. Update the expected counts in `backend/tests/test_document_specs.py` and
   `frontend/test/generic/registry.test.ts`, and the available set in both
   catalog suites.

## What is here, and what is not

Covered, with the number of values each asks for:

| Document | Fields | Span classes used |
| --- | --- | --- |
| AI Addendum | 4 | `coverpage` |
| Business Associate Agreement | 4 | `keyterms` |
| Pilot Agreement | 5 | `orderform` |
| Design Partner Agreement | 6 | `keyterms` |
| Service Level Agreement | 7 | `coverpage`, `orderform` |

Counts exclude the two party roles and any derived term, which is why they are
lower than a raw count of distinct spans.

Still to do — the large, multi-exhibit agreements, where the values are split
across two or three separate exhibits and the split is a design decision rather
than something the markup states:

| Document | Distinct terms | Why it is harder |
| --- | --- | --- |
| Data Processing Agreement | 14 | GDPR Article 28 schedule content |
| Partnership Agreement | 19 | adds a `businessterms` tier |
| Cloud Service Agreement | 19 | Cover Page + Order Form + Key Terms |
| Software License Agreement | 20 | the same three-way split |
| Professional Services Agreement | 25 | Key Terms plus a repeatable SOW |
