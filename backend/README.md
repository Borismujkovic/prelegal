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
| `POST /api/documents/mutual-nda/chat` | One turn of the Mutual NDA's own chat. Stateless — see below. |
| `POST /api/documents/{document_id}/chat` | One turn for any other draftable document. 404 if the id is unknown or not yet available. |
| `POST /api/assistant/chat` | Recommends which document the user needs. |

The literal NDA route is registered **before** the parameterised one in
`main.py`. Starlette matches routes in registration order with no preference for
a more specific path, so that ordering is the only thing keeping the NDA's own
handler. `tests/test_documents_chat.py` fails if it is swapped.

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

## Two chat engines, on purpose

`llm.py` drafts the Mutual NDA. `generic_llm.py` drafts everything else, from
data: `document_specs.py` reads `cover-pages/<id>.json` for a document's fields,
and `dynamic_models.py` builds that document's Structured Outputs schema with
`create_model`.

They look alike, and merging them would be a mistake. The NDA's two term fields
are tagged unions (`{"kind": "fixed", "years": 3}`) that no other agreement has,
so a string-keyed engine would have to special-case the one document the engine
exists to stop treating specially. The NDA is also the only implementation that
has been exercised against the real provider and is covered by a parity suite.
The duplication is paid once; the risk would be paid every time either changed.

### Why the patch schema is built per document rather than being a dict

Strict Structured Outputs requires every property enumerated with
`additionalProperties: false`. A `dict[str, str]` is by definition a schema with
unbounded keys, so it cannot be expressed strictly — the provider would either
refuse it or stop enforcing it, and enforcement is the entire reason the patch
is a structured output rather than prose to be parsed. Enumerating the keys also
tells the model exactly which fields exist, so it cannot invent one.

### The assistant always leaves the user a move

Each turn reports `needsFollowUp`. When it is true and the reply does not end in
a question, `conversation.ensure_follow_up_question` appends one. Rejecting the
turn instead would throw away a good reply and a valid patch over punctuation,
and cost the user a round trip to fix it.

## Picking a document

`POST /api/assistant/chat` takes a description of the situation and recommends
an agreement. Two things are deliberately not left to the model: the recommended
id is a `Literal` of real catalog ids, so a document that does not exist cannot
be recommended; and whether that document is *available* is looked up in the
catalog afterwards rather than asked for, because a model reporting its own
availability would be a second source of truth that could disagree with the
first.

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
| `src/prelegal/llm.py` | The Mutual NDA's assistant: prompt, and the one model call |
| `src/prelegal/generic_llm.py` | The same, for every other document, built from its spec |
| `src/prelegal/document_specs.py` | Reads `cover-pages/*.json`: what each document asks for |
| `src/prelegal/fields.py` | Which values a template substitutes, read from its span markup |
| `src/prelegal/dynamic_models.py` | Per-document Structured Outputs schemas |
| `src/prelegal/conversation.py` | The guarantee that a turn ends on a question |
| `src/prelegal/triage.py` | Recommending which document someone needs |
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
| `tests/test_chat.py` | The Mutual NDA's turn end to end, the prompt it builds, and every failure path |
| `tests/test_documents_chat.py` | The same for the generic engine, plus that the NDA's own route still wins |
| `tests/test_assistant_chat.py` | Recommendations, and that an invented document id cannot survive |
| `tests/test_document_specs.py` | Every overlay against the template it describes, both directions |
| `tests/test_fields.py` | Reading field names out of span markup, including its edge cases |
| `tests/test_conversation.py` | The follow-up-question guarantee, as a pure function |

`tests/test_catalog.py` reads the shipped `catalog.json` rather than a fixture —
a fixture would stay green while the catalog the product ships broke.

`tests/test_chat.py` never calls the provider. It monkeypatches
`prelegal.llm.completion`, which is why `llm.py` imports that name at module
level rather than reaching into litellm inside the function.
