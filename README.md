# prelegal

A platform for drafting common legal agreements.

## Status

**🚧 In progress — not ready for use.**

This project is under active development. The target completion date is
**21 September 2026** (one week from 14 September 2026).

Until then, the project structure, APIs, and documentation are expected to
change. See #1.

> **There is no authentication.** The sign-in screen is a placeholder: any email
> address gets you in, no password is asked for, and nothing is verified. Do not
> put real confidential information into this yet.

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

Copy `.env.example` to `.env` and fill in `OPENROUTER_API_KEY`. The Mutual NDA
chat needs it; without it the app still runs and the cover page can still be
filled in by hand, but the assistant replies that it is not configured. `.env`
is gitignored.

## Layout

| Directory | What it holds |
| --- | --- |
| [`templates/`](templates) | The agreement dataset: verbatim Common Paper templates, CC BY 4.0 |
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
| Placeholder sign-in | Creates a user row from an email. No password, no security. |
| Document dashboard | All 11 agreements from `catalog.json` |
| Mutual NDA creator | Draft the cover page by chatting with an AI, or type it in by hand; download as PDF or Markdown |

The other ten agreements are listed but not yet draftable. Common Paper
publishes a cover page for the Mutual NDA alone, and the cover page is the part
a user fills in — see [`templates/README.md`](templates/README.md).

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
