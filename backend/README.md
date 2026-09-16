# Prelegal backend

FastAPI. Serves the JSON API under `/api`, and the statically exported frontend
at everything else.

## Running it

Normally you do not run this directly — [`scripts/`](../scripts) brings up the
whole container. For backend work alone:

```bash
uv sync
uv run uvicorn prelegal.main:app --reload --port 8000
```

Requests to `/` will return 503 until the frontend has been built
(`cd ../frontend && npm run build`). The API works regardless.

## Endpoints

| Endpoint | What it does |
| --- | --- |
| `GET /api/health` | Liveness. Reports whether SQLite and the catalog are readable. |
| `POST /api/session` | Placeholder sign-in. Finds or creates a user by email. |
| `GET /api/catalog` | The 11 documents from `catalog.json`. |
| `POST /api/documents/mutual-nda/chat` | One turn of the drafting chat. Stateless — see below. |

`/docs` has the generated OpenAPI UI.

## There is no authentication

`POST /api/session` takes an email and hands back a user row. It asks for no
password, issues no token, and verifies nothing — anyone can sign in as anyone.
This is [PL-4](https://borismujkovic.atlassian.net/browse/PL-4) as specified: a
way into the platform, not a security boundary. The route guard in the frontend
is a convenience for the same reason.

What it does buy is a proven path from browser to API to database, so the
foundation is demonstrated rather than assumed. When real auth arrives,
`routers/session.py` is replaced wholesale.

## The chat keeps no state

`POST /api/documents/mutual-nda/chat` answers one message and returns two
things: the reply, and a *patch* naming only the Cover Page fields that message
established. The browser holds the transcript and the Cover Page and resends
both every turn, so this server stores nothing and no session has to be kept
alive between requests.

That is what lets the assistant see a value the user typed into the manual form
rather than said out loud: the form and the chat write to the same state in the
browser, and the whole of it goes up with the next turn. The system prompt is
rebuilt from those values each time, so the assistant is *told* what is already
answered instead of inferring it from the conversation.

A patch is a diff, not a summary. An absent field means "leave this alone",
never "clear this", which is what stops a turn about the governing law from
wiping a party name given three messages ago.

The call goes through LiteLLM to `openrouter/openai/gpt-oss-120b` with Cerebras
as the inference provider, using Structured Outputs — the reply and the patch
come back as one validated object, so they cannot disagree. `prelegal.llm` owns
the prompt and the call and can be exercised without an app; the router only
translates to and from HTTP. Without `OPENROUTER_API_KEY` the endpoint answers
503 before attempting a doomed network call, and a provider failure becomes a
502 whose detail is deliberately generic — the cause is logged instead, because
a provider error body can carry request internals.

## The database is disposable

`db.init_db` drops every table and recreates it on each boot, per the project's
"created from scratch each time the container is brought up" rule. There is no
migration story because there is nothing yet worth migrating — that is the first
thing to add when persistence starts to matter.

Connections are opened per call rather than pooled. At this size that costs
nothing and sidesteps the thread-affinity rules that make a shared `sqlite3`
connection awkward under FastAPI's threadpool.

## Layout

| Path | Role |
| --- | --- |
| `src/prelegal/main.py` | App factory, and serving the frontend export |
| `src/prelegal/config.py` | Paths, overridable by `PRELEGAL_*` env vars |
| `src/prelegal/db.py` | Connection handling and the schema |
| `src/prelegal/models.py` | Request and response shapes |
| `src/prelegal/catalog.py` | Reads and caches `catalog.json` |
| `src/prelegal/llm.py` | The drafting assistant: prompt, and the one model call |
| `src/prelegal/routers/` | One module per endpoint group |

### Serving a static export is not quite static serving

`next build` with `output: "export"` writes `/login` as `login.html`, not
`login/index.html`, so a plain static mount 404s on every route but `/`.
`_resolve_static_file` reproduces nginx's `try_files $uri $uri.html
$uri/index.html`, which is what the Next.js deployment docs prescribe for
`trailingSlash: false`. It also refuses any path that resolves outside the
export directory.

## Tests

```bash
uv run pytest
```

| Path | What it covers |
| --- | --- |
| `tests/test_session.py` | Find-or-create, case handling, validation |
| `tests/test_catalog.py` | The real `catalog.json`, including that every template path exists |
| `tests/test_frontend_serving.py` | Route resolution, the 404 page, path traversal |
| `tests/test_health.py` | Health reporting, and that the database really is recreated on boot |
| `tests/test_chat.py` | One turn end to end, the prompt it builds, and every failure path |

`tests/test_catalog.py` reads the shipped `catalog.json` rather than a fixture —
a fixture would stay green while the catalog the product ships broke.

`tests/test_chat.py` never calls the provider. It monkeypatches
`prelegal.llm.completion`, which is why `llm.py` imports that name at module
level rather than reaching into litellm inside the function.
