# prelegal

A platform for drafting common legal agreements.

## Status

**🚧 In progress — not ready for use.**

This project is under active development. The target completion date is
**21 September 2026** (one week from 14 September 2026).

Until then, the project structure, APIs, and documentation are expected to
change. See #1.

> **Your account does not survive a restart.** Sign-in is real — a password, a
> hashed credential, a revocable session — but the database is recreated from
> scratch every time the container boots, so accounts and saved drafts are
> deliberately temporary. Nothing here has been through a security review, and
> what it produces is a draft for a lawyer to look at, not advice.

## Running it

Docker is the only prerequisite.

```bash
# Mac
scripts/start-mac.sh
scripts/stop-mac.sh

# Linux
scripts/start-linux.sh
scripts/stop-linux.sh

# Windows
scripts/start-windows.ps1
scripts/stop-windows.ps1
```

Then open **http://localhost:8000**. Interactive API docs are at
[`/docs`](http://localhost:8000/docs).

If something else on your machine already holds port 8000, set `PRELEGAL_PORT`
to move it — for one run:

```bash
PRELEGAL_PORT=8001 scripts/start-linux.sh
```

…or for every run, by adding it to `.env`:

```
PRELEGAL_PORT=8001
```

Only the host side moves; the container still listens on 8000 internally. The
start scripts ask Docker which port it actually published, so they poll that
one and print the real URL when the app comes up.

### Configuration

Copy `.env.example` to `.env` and fill in `OPENROUTER_API_KEY`. The chat needs
it; without it the app still runs and every document can still be filled in by
hand, but the assistant replies that it is not configured. `.env` is gitignored.

## Layout

| Directory | What it holds |
| --- | --- |
| [`templates/`](templates) | The agreement dataset: verbatim Common Paper templates, CC BY 4.0 |
| [`cover-pages/`](cover-pages) | The cover pages Common Paper never published — ours, kept out of `templates/` so that stays verbatim |
| [`catalog.json`](catalog.json) | What Prelegal can draft, and which templates back each one |
| [`backend/`](backend) | FastAPI app: the API, and it serves the built frontend |
| [`frontend/`](frontend) | Next.js app, statically exported |
| [`scripts/`](scripts) | Start and stop, per platform |

## How it fits together

One container, one port. The frontend is built to static HTML/CSS/JS at image
build time and FastAPI serves it, so there is no second process and no CORS.

```
                     ┌──────────────── container ────────────────┐
  browser ──:8000──> │  FastAPI                                  │
                     │    /api/*  ──> SQLite (recreated on boot) │
                     │    /*      ──> frontend/out (next build)  │
                     └───────────────────────────────────────────┘
```

The database is **deliberately disposable**: every table is dropped and
recreated each time the container starts. Nothing entered in a previous run
survives, and nothing should be built on the assumption that it does.

## What works today

| | |
| --- | --- |
| Accounts | Sign up and sign back in with a password. Sessions are server-side and revocable; the cookie carrying one is not readable by scripts. |
| Document dashboard | All 11 agreements from `catalog.json` |
| "Which one do I need?" | Describe your situation and an assistant recommends an agreement — or says plainly that Prelegal does not draft what you asked for |
| Six draftable agreements | Draft by chatting with an AI, or type the fields in by hand; download as PDF or Markdown |
| Saved drafts | Save what you are working on and come back to it. Only for as long as the container is up — see the note above. |

Draftable today: **Mutual NDA**, **AI Addendum**, **Business Associate
Agreement**, **Pilot Agreement**, **Service Level Agreement** and **Design
Partner Agreement**.

The remaining five — Cloud Service Agreement, Software License Agreement,
Professional Services Agreement, Partnership Agreement and Data Processing
Agreement — are listed but not yet draftable. Common Paper publishes a cover
page for the Mutual NDA alone, and the cover page is the part a user fills in,
so the others had to be written rather than sourced. Those five split their
values across two or three separate exhibits, which is a design decision the
templates do not make for us. See [`cover-pages/README.md`](cover-pages/README.md).

## Tests

```bash
# Frontend
cd frontend && npm install && npm test

# Backend (needs uv, or run it in the container image)
cd backend && uv run pytest
```

## Licence

Generated documents are derivative works of the Common Paper templates, which
are [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The attribution
travels with every document and export, and must stay there.
