# Prelegal Project

## Overview

This is a SaaS product to allow users to draft legal agreements based on templates in the templates directory.
The user can carry out AI chat in order to establish what document they want and how to fill in the fields.
The available documents are covered in the catalog.json file in the project root, included here:

@catalog.json

That is the goal. For what is actually built today, see **Current state** at the end of this file — check there before assuming a capability exists.

## Development process

When instructed to build a feature:
1. Use your Atlassian tools to read the feature instructions from Jira
2. Develop the feature - do not skip any step from the feature-dev 7 step process
3. Thoroughly test the feature with unit tests and integration tests and fix any issues
4. Submit a PR using your github tools

## AI design

When writing code to make calls to LLMs, use your Cerebras skill to use LiteLLM via OpenRouter to the `openrouter/openai/gpt-oss-120b` model with Cerebras as the inference provider. You should use Structured Outputs so that you can interpret the results and populate fields in the legal document.

There is an OPENROUTER_API_KEY in the .env file in the project root.

## Technical design

The entire project should be packaged into a Docker container.  
The backend should be in backend/ and be a uv project, using FastAPI.  
The frontend should be in frontend/  
The database should use SQLLite and be created from scratch each time the Docker container is brought up, allowing for a users table with sign up and sign in.  
The frontend is statically built and served by FastAPI — this was tried and it works, so treat it as settled. It means the frontend has no server: no Server Actions, no Route Handlers reading a request, no server-side redirects. Anything needing a server belongs in the backend under `/api`.  
There should be scripts in scripts/ for:  
```bash
# Mac
scripts/start-mac.sh    # Start
scripts/stop-mac.sh     # Stop

# Linux
scripts/start-linux.sh
scripts/stop-linux.sh

# Windows
scripts/start-windows.ps1
scripts/stop-windows.ps1
```
Backend available at http://localhost:8000

## Color Scheme
- Accent Yellow: `#ecad0a`
- Blue Primary: `#209dd7`
- Purple Secondary: `#753991` (submit buttons)
- Dark Navy: `#032147` (headings)
- Gray Text: `#888888`

Available as Tailwind tokens in `frontend/src/app/globals.css`: `navy`, `brand-blue`,
`brand-purple`, `brand-yellow`, `brand-gray` (e.g. `text-navy`, `bg-brand-purple`).
The Mutual NDA creator predates these and keeps its own slate/indigo styling.

## Current state

Last updated: PL-7, 17 September 2026.

**Built:**
- The full stack: FastAPI backend in `backend/` (uv project), SQLite, Docker, start/stop scripts. One container, one port.
- `catalog.json` — all 11 documents, with an `available` flag. Six are available.
- Landing page at `/` for signed-out visitors; signed-in ones go straight to `/documents`.
- Dashboard at `/documents` listing the catalog, with a triage assistant above it.
- Mutual NDA creator at `/documents/mutual-nda` — draft the cover page by chatting with the AI, or type it in by hand; download PDF or Markdown.
- **AI chat for six documents.** The Mutual NDA has its own hand-written implementation (`llm.py`, `routers/chat.py`); the other five go through a generic engine (`generic_llm.py`, `routers/documents.py`) driven by data. Both use LiteLLM → OpenRouter → `gpt-oss-120b` on Cerebras with Structured Outputs. See `backend/README.md`.
- **A triage assistant.** `POST /api/assistant/chat` recommends a document from a description of the situation, or says plainly that Prelegal does not draft what was asked for. The recommended id is constrained to a `Literal` of real catalog ids, so it cannot invent one, and availability is derived from the catalog rather than trusted from the model.
- **`cover-pages/`** — the cover pages Common Paper never published, written as JSON and read by *both* the frontend build and the backend at runtime, so labels are authored once. See `cover-pages/README.md`.
- **Real accounts.** `/signup` and `/login` take a password, hashed with `hashlib.scrypt`; the session is an opaque token in a `sessions` table, carried by an HttpOnly SameSite=Lax cookie. No new dependency — see `backend/README.md` for why not bcrypt or JWT, and for the scrypt cost, timing and CSRF reasoning.
- **Saved drafts.** Press Save in either creator and it goes to `/api/drafts`; `/documents/history` lists them, and opening one reloads its values into the creator via `?draft=<id>`. Ownership is in every query and another user's draft answers 404, not 403.
- **A draft disclaimer inside the document.** One source of truth in `frontend/src/lib/disclaimer.ts`, rendered by both document components and both markdown exports so it reaches the PDF and the `.md`, immediately before the Common Paper attribution and never in place of it.

**Not built yet — do not assume otherwise:**
- **The five largest documents.** CSA, Software License, PSA, Partnership and DPA are listed but not draftable. Each splits its values across two or three exhibits (Order Form / Key Terms / SOW / Business Terms), and that split is a design decision the markup does not state. 14–25 fields each.
- **Saved conversations.** A draft stores the *values*, not the transcript. Reopening one gives you the document as you left it and a fresh chat. The chat endpoints remain stateless by design: the browser resends the transcript every turn and the server stores none of it.
- **Anything that survives a restart.** The database is still recreated on every boot, so accounts and saved drafts last as long as the container does. PL-7 asked for exactly that; it is not an oversight.

**Constraints worth knowing before you start:**
- The database is disposable: every table — `users`, `sessions`, `drafts` — is dropped and recreated on each boot, so a restart signs everybody out and deletes their drafts. There is still no migration story, and it is now the obvious thing to add first. The drops are ordered children-first in `db.SCHEMA`. Given the `ON DELETE CASCADE` clauses that order is not strictly required today, but it becomes required the moment one of them changes — at which point the wrong order fails the lifespan handler on the *second* boot and only the second. See the comment on `SCHEMA`.
- `templates/` is verbatim Common Paper, CC BY 4.0. Never hand-edit it; the frontend parses it at build time into `nda-template.generated.ts` (the NDA) and `src/lib/generated/*.generated.ts` (the rest). The attribution must travel into every generated document — and note only `mutual-nda.md` carries a licence line of its own, so the other five take theirs from `catalog.json`.
- **Adding a document is a data change, not a code change.** Write `cover-pages/<id>.json`, add the id to `DOCUMENT_IDS` in `frontend/scripts/generate-documents.mjs`, flip `available` in `catalog.json`. Both generators refuse to build if the overlay and the template disagree about the field set in either direction — that check is what replaces the NDA's compile-time exhaustiveness now that fields are data.
- The two chat engines are deliberately separate. The Mutual NDA's tagged-union term fields exist in no other document, so folding it into the generic engine would mean special-casing the very document the engine was meant to stop being special.
- The frontend is **Next.js 16**, which differs from most training data. Read `frontend/AGENTS.md` and the version-matched docs in `frontend/node_modules/next/dist/docs/` before writing frontend code.
- `docker build` needs network access to `fonts.googleapis.com`, because `next/font/google` downloads and self-hosts the fonts at build time.
- Port 8000 is the default; set `PRELEGAL_PORT` if something else on the machine holds it.
- Without `OPENROUTER_API_KEY` the app still boots and the cover page can still be filled in by hand; only the chat endpoint answers 503. Keep it that way — the key is not required to run or test the app, and `backend/tests/test_chat.py` never calls the provider.

**Endpoints:** `GET /api/health`, `GET /api/catalog`, `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/documents/mutual-nda/chat`, `POST /api/documents/{document_id}/chat`, `POST /api/assistant/chat`, and `POST|GET /api/drafts` with `GET|PUT|DELETE /api/drafts/{id}`. Generated docs at `/docs`. The `/api/drafts` routes are the only ones guarded by a session — the chat endpoints deliberately are not. `GET /api/auth/me` also answers 401 without one, but it exists to *report* whether you have a session, so everyone calls it either way.

The literal NDA route must stay registered *before* the parameterised one in `main.py`: Starlette matches in registration order with no preference for a more specific path. `backend/tests/test_documents_chat.py` pins that. Saved drafts live under `/api/drafts` rather than `/api/documents` so that nothing else has to.

Two frontend traps that only show up at `next build`, not in `next dev` or the tests: a page reading `?draft=` through `useSearchParams` must sit under a `<Suspense>` boundary or the export fails, and `/documents/history` only wins over `/documents/[documentId]` because a literal segment out-ranks a dynamic sibling — a document given the id `history` would silently become undraftable.