# Legal Agreement Templates

This directory is the Prelegal template dataset: the source agreements the system
edits on a user's behalf. Every file here is an unmodified copy of a Common Paper
standard agreement.

## Source and licence

All templates come from the [Common Paper](https://github.com/CommonPaper) GitHub
organisation and are used under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), which permits copying
and modification with attribution.

> Agreement templates © Common Paper, licensed under CC BY 4.0.

Anything Prelegal generates from these templates is a derivative work, so the
attribution above needs to travel with it — keep it in whatever the user
downloads or exports.

## Contents

Files were copied verbatim; only the filenames were normalised to kebab-case so
the dataset can be addressed programmatically. `commit` is the upstream revision
each copy was taken from.

| File | Agreement | Source repo | Commit | Upstream date |
| --- | --- | --- | --- | --- |
| `ai-addendum.md` | AI Addendum | [AI-Addendum](https://github.com/CommonPaper/AI-Addendum) | `6d9b044` | 2025-08-07 |
| `business-associate-agreement.md` | Business Associate Agreement (BAA) | [BAA](https://github.com/CommonPaper/BAA) | `5f1fd99` | 2025-05-23 |
| `cloud-service-agreement.md` | Cloud Service Agreement (CSA) | [CSA](https://github.com/CommonPaper/CSA) | `4afc1f9` | 2025-05-20 |
| `data-processing-agreement.md` | Data Processing Agreement (DPA) | [DPA](https://github.com/CommonPaper/DPA) | `9f1c40d` | 2025-05-09 |
| `design-partner-agreement.md` | Design Partner Agreement | [Design-Partner-Agreement](https://github.com/CommonPaper/Design-Partner-Agreement) | `94a1cf8` | 2026-09-11 |
| `mutual-nda.md` | Mutual NDA — Standard Terms | [Mutual-NDA](https://github.com/CommonPaper/Mutual-NDA) | `2a3068b` | 2022-06-07 |
| `mutual-nda-cover-page.md` | Mutual NDA — Cover Page | [Mutual-NDA](https://github.com/CommonPaper/Mutual-NDA) | `2a3068b` | 2022-06-07 |
| `partnership-agreement.md` | Partnership Agreement | [Partnership-Agreement](https://github.com/CommonPaper/Partnership-Agreement) | `6edeb5a` | 2025-05-23 |
| `pilot-agreement.md` | Pilot Agreement | [Pilot-Agreement](https://github.com/CommonPaper/Pilot-Agreement) | `5e7cdd4` | 2025-07-22 |
| `professional-services-agreement.md` | Professional Services Agreement (PSA) | [PSA](https://github.com/CommonPaper/PSA) | `3fb650a` | 2025-05-23 |
| `service-level-agreement.md` | Service Level Agreement (SLA) | [SLA](https://github.com/CommonPaper/SLA) | `5b0e633` | 2025-05-20 |
| `software-license-agreement.md` | Software License Agreement | [Software-License-Agreement](https://github.com/CommonPaper/Software-License-Agreement) | `8ea7de3` | 2025-05-20 |

Three other Common Paper repos were reviewed and excluded because they hold no
agreement templates: `docs` (technical documentation), `story-prompt` (a hiring
exercise), and `claude-skill` (an agent skill).

## Notes for anyone consuming these files

- **Standard Terms vs. Cover Page.** Common Paper splits an agreement into
  boilerplate Standard Terms plus a short Cover Page (or Order Form / Key Terms)
  carrying the deal-specific values. Only the Mutual NDA publishes its cover page
  as markdown upstream; for the rest, only the Standard Terms exist here. The
  negotiated fields are what a user actually fills in, so a cover page for each
  of the other agreements had to be written rather than sourced — those live in
  [`cover-pages/`](../cover-pages), separate from this directory so that these
  files stay verbatim. Five are written; see that directory's README for which.
- **Inline HTML is meaningful.** Most files wrap terms in spans such as
  `<span class="coverpage_link">Customer</span>`, `keyterms_link`, `orderform_link`,
  `sow_link`, and `businessterms_link`. Each one marks a value defined on the
  Cover Page / Key Terms / Order Form / SOW / Business Terms rather than in the
  body — these are the substitution points a document generator should target.
  `header_2` / `header_3` spans carry the clause numbering. Strip this markup and
  the templates lose their structure.
- **Scan for every span class, not the one you expect.** A single agreement can
  mix them: the SLA uses `coverpage_link` and `orderform_link` together, and
  `businessterms_link` appears only in the Partnership Agreement. Filtering by
  the class an agreement is nominally filed under silently drops fields.
- **A term can appear inside other markup.** The Pilot Agreement's liability cap
  wraps its span in a bold run, and the same term appears possessive elsewhere
  (`Provider` and `Provider's` are one value, with both straight and curly
  apostrophes in use). A parser that matches bold before spans, or that does not
  normalise possessives, will undercount.
- **Only the Mutual NDA carries a CC BY line.** The other templates end at their
  definitions, so anything generated from them has to take the attribution from
  `catalog.json` instead. It still has to travel with the document.
- **Agreements are composable.** The AI Addendum, DPA, BAA, and SLA are meant to
  attach to a primary agreement (usually the CSA or Software License Agreement),
  not to stand alone.
- **These are verbatim copies.** Edit them only to pull in a new upstream version,
  and update the commit column when you do.
