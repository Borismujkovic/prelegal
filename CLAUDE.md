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

Last updated: PL-6, 16 September 2026.

**Built:**
- The full stack: FastAPI backend in `backend/` (uv project), SQLite, Docker, start/stop scripts. One container, one port.
- `catalog.json` — all 11 documents, with an `available` flag. Six are available.
- Dashboard at `/documents` listing the catalog, with a triage assistant above it.
- Mutual NDA creator at `/documents/mutual-nda` — draft the cover page by chatting with the AI, or type it in by hand; download PDF or Markdown.
- **AI chat for six documents.** The Mutual NDA has its own hand-written implementation (`llm.py`, `routers/chat.py`); the other five go through a generic engine (`generic_llm.py`, `routers/documents.py`) driven by data. Both use LiteLLM → OpenRouter → `gpt-oss-120b` on Cerebras with Structured Outputs. See `backend/README.md`.
- **A triage assistant.** `POST /api/assistant/chat` recommends a document from a description of the situation, or says plainly that Prelegal does not draft what was asked for. The recommended id is constrained to a `Literal` of real catalog ids, so it cannot invent one, and availability is derived from the catalog rather than trusted from the model.
- **`cover-pages/`** — the cover pages Common Paper never published, written as JSON and read by *both* the frontend build and the backend at runtime, so labels are authored once. See `cover-pages/README.md`.

**Not built yet — do not assume otherwise:**
- **The five largest documents.** CSA, Software License, PSA, Partnership and DPA are listed but not draftable. Each splits its values across two or three exhibits (Order Form / Key Terms / SOW / Business Terms), and that split is a design decision the markup does not state. 14–25 fields each.
- **Authentication.** `/login` is a placeholder: any email creates or finds a user row, with no password, no token and nothing verified. The route guard is client-side. Not a security boundary.
- **Document persistence.** Nothing a user drafts is saved — not the document, not the conversation. The creator holds both in React; a page reload starts over. Every chat backend is stateless by design: the browser resends the transcript and the values every turn, and the server stores neither.

**Constraints worth knowing before you start:**
- The database is disposable: every table is dropped and recreated on each boot. Only a `users` table exists. There is no migration story — add one when persistence starts to matter.
- `templates/` is verbatim Common Paper, CC BY 4.0. Never hand-edit it; the frontend parses it at build time into `nda-template.generated.ts` (the NDA) and `src/lib/generated/*.generated.ts` (the rest). The attribution must travel into every generated document — and note only `mutual-nda.md` carries a licence line of its own, so the other five take theirs from `catalog.json`.
- **Adding a document is a data change, not a code change.** Write `cover-pages/<id>.json`, add the id to `DOCUMENT_IDS` in `frontend/scripts/generate-documents.mjs`, flip `available` in `catalog.json`. Both generators refuse to build if the overlay and the template disagree about the field set in either direction — that check is what replaces the NDA's compile-time exhaustiveness now that fields are data.
- The two chat engines are deliberately separate. The Mutual NDA's tagged-union term fields exist in no other document, so folding it into the generic engine would mean special-casing the very document the engine was meant to stop being special.
- The frontend is **Next.js 16**, which differs from most training data. Read `frontend/AGENTS.md` and the version-matched docs in `frontend/node_modules/next/dist/docs/` before writing frontend code.
- `docker build` needs network access to `fonts.googleapis.com`, because `next/font/google` downloads and self-hosts the fonts at build time.
- Port 8000 is the default; set `PRELEGAL_PORT` if something else on the machine holds it.
- Without `OPENROUTER_API_KEY` the app still boots and the cover page can still be filled in by hand; only the chat endpoint answers 503. Keep it that way — the key is not required to run or test the app, and `backend/tests/test_chat.py` never calls the provider.

**Endpoints:** `GET /api/health`, `POST /api/session`, `GET /api/catalog`, `POST /api/documents/mutual-nda/chat`, `POST /api/documents/{document_id}/chat`, `POST /api/assistant/chat`. Generated docs at `/docs`.

The literal NDA route must stay registered *before* the parameterised one in `main.py`: Starlette matches in registration order with no preference for a more specific path. `backend/tests/test_documents_chat.py` pins that.