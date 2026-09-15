# prelegal

A platform for drafting common legal agreements.

## Status

**🚧 In progress — not ready for use.**

This project is under active development. The target completion date is
**21 September 2026** (one week from 14 September 2026).

Until then, the project structure, APIs, and documentation are expected to
change. Installation, usage, and configuration instructions will be added as
the codebase lands — see #1.

## Layout

| Directory | What it holds |
| --- | --- |
| [`templates/`](templates) | The agreement dataset: verbatim Common Paper templates, CC BY 4.0 |
| [`frontend/`](frontend) | Next.js app for drafting agreements from those templates |

The first agreement is live: `frontend/` renders a **Mutual NDA** from a filled-in
cover page and downloads it as PDF or Markdown. See
[`frontend/README.md`](frontend/README.md) to run it.
