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
| `POST /api/auth/register` | Create an account and sign in. 409 if the email is taken. |
| `POST /api/auth/login` | Check a password and start a session. |
| `POST /api/auth/logout` | End this session. 204 even if there was not one. |
| `GET /api/auth/me` | Who the cookie says you are. 401 if nobody. |
| `GET /api/catalog` | The 11 documents from `catalog.json`. |
| `POST /api/documents/mutual-nda/chat` | One turn of the Mutual NDA's own chat. Stateless — see below. |
| `POST /api/documents/{document_id}/chat` | One turn for any other draftable document. 404 if the id is unknown or not yet available. |
| `POST /api/assistant/chat` | Recommends which document the user needs. |
| `POST /api/drafts` | Save a draft. |
| `GET /api/drafts` | This user's saved drafts, most recently worked on first. Without the values. |
| `GET /api/drafts/{id}` | One saved draft, with its values. |
| `PUT /api/drafts/{id}` | Save over one. |
| `DELETE /api/drafts/{id}` | Throw one away. |

Everything under `/api/drafts` requires a session, and nothing else guards a
resource behind one — in particular the chat endpoints do not, and PL-7
deliberately left them alone. `GET /api/auth/me` uses the same dependency and so
also answers 401 without a session, but it is not a guard: its whole job is to
report whether you have one, and everyone is expected to call it either way.

The literal NDA route is registered **before** the parameterised one in
`main.py`. Starlette matches routes in registration order with no preference for
a more specific path, so that ordering is the only thing keeping the NDA's own
handler. `tests/test_documents_chat.py` fails if it is swapped.

`/docs` has the generated OpenAPI UI.

## Authentication

Through PL-6 there was none: `POST /api/session` took an email and handed back a
user row, asking for no password and verifying nothing.
[PL-7](https://borismujkovic.atlassian.net/browse/PL-7) replaced that module
wholesale, as its own README said it would. `auth.py` and `routers/auth.py` are
what replaced it.

Passwords are hashed with `hashlib.scrypt` and sessions are opaque tokens in a
`sessions` table, delivered as an HttpOnly, SameSite=Lax cookie. No new
dependency was added for any of it. bcrypt and PyJWT are the reflex answers and
both would have been new packages — one a native wheel in the image build — to
do what the standard library already does. The one thing a token library would
have bought is statelessness, which is the wrong trade here: a row in `sessions`
is what makes signing out actually end a session rather than merely asking the
browser to forget it.

A stored hash names the parameters that made it — `scrypt$16384$8$1$<salt>$<hash>`
— and verification re-derives with *those* rather than with today's constants, so
the cost can be raised later without invalidating every password already set.

### Decisions worth knowing before changing any of it

**The cost is N=2¹⁴, below OWASP's suggested 2¹⁷.** Two reasons. `hashlib.scrypt`
refuses anything above 32 MiB with "memory limit exceeded" unless `maxmem` is
passed explicitly, so a larger N needs that argument too; and 2¹⁷ means 128 MiB
held per concurrent login in one small container, which makes the login endpoint
the cheapest way to exhaust its memory. Raise it behind a real deployment with a
request limiter in front.

**An unknown email costs the same as a wrong password.** `login` always verifies,
against `DUMMY_PASSWORD_HASH` when there is no such user, and both failures
return the same words. Skipping the hash for an unknown email would let response
time alone say who has an account here.

**Registering does report that an email is taken.** A real disclosure, and a
deliberate one: the alternative is to accept the signup and say nothing, which
needs an email round trip to be usable, and there is no mail in this system.

**No CSRF token, on purpose.** Every state-changing route is POST/PUT/DELETE, so
SameSite=Lax withholds the cookie from cross-site form posts; the API is
JSON-only, and an HTML form cannot send `application/json`; and there is no CORS
middleware, so a credentialed cross-origin `fetch` never gets a reply. Revisit
this if a separately-hosted frontend is ever pointed at this API.

**The cookie is not `Secure` by default.** Nothing in `scripts/` or the
Dockerfile terminates TLS, and a `Secure` cookie on an http origin is dropped
silently — which presents as "login succeeds, then you are immediately signed
out again". `PRELEGAL_SESSION_COOKIE_SECURE=true` turns it on.

The frontend's route guard is still client-side, because a static export has no
server in the request path. It is no longer the only thing in the way, though:
every route that touches a user's data checks the cookie here.

## Saved drafts

`drafts` holds what a user has written, so they can come back to it. Three
things about it:

**`values_json` is opaque.** The Mutual NDA's Cover Page and the generic
engine's open field map are different shapes, and this store knows about
neither. It validates that the body is a JSON object under a size cap, writes it
to a TEXT column, and reads it back. Nothing server-side interprets it. What
makes that safe is the browser, which narrows it back field by field and falls
back to defaults on anything it does not recognise — so a draft saved by an
older build cannot break the renderer.

**Ownership is part of every query.** `user_id = ?` is in the WHERE clause
rather than checked after the row is fetched, so there is no path that reads
someone else's draft and then decides. Acting on another user's draft answers
**404, not 403**: a 403 confirms the id exists, which is all anyone needs to
count other people's drafts.

**They are called drafts, not documents.** `/api/documents/{document_id}/chat`
already exists and its `document_id` is a *type* — `pilot-agreement`. Putting
saved drafts under the same prefix would have left it meaning two things, told
apart only by whether the segment happened to be digits.

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

`db.init_db` drops every table — `users`, `sessions`, `drafts` — and recreates
it on each boot, per the project's "created from scratch each time the container
is brought up" rule. PL-7 kept it that way with accounts and saved drafts on
top, because the ticket asked for exactly that: registering and saving last as
long as the container does, and a restart signs everybody out and takes their
drafts with it. There is still no migration story, and it is now the obvious
thing to add first.

The drops are ordered children-first, which is correct but not for the obvious
reason. `connect` enables foreign keys before the script runs, and on every boot
after the first the tables still hold the previous run's rows — the file
outlives the process. SQLite runs an implicit `DELETE FROM` before dropping a
table, so given the `ON DELETE CASCADE` clauses in the schema, dropping `users`
first would actually succeed today: the delete would cascade. The ordering earns
its keep the moment one of those clauses changes, because the same drop then
raises "FOREIGN KEY constraint failed" inside the lifespan handler — and the app
would fail to start on its second boot and only its second. Children-first is
correct under either declaration, so nobody has to remember this.

One user-visible consequence: a session cookie outlives the rows it names. The
token then resolves to nothing, which is indistinguishable from a forged one,
and both are answered with 401 and a `Set-Cookie` that clears it.

Connections are opened per call rather than pooled. At this size that costs
nothing and sidesteps the thread-affinity rules that make a shared `sqlite3`
connection awkward under FastAPI's threadpool.

## Layout

| Path | Role |
| --- | --- |
| `src/prelegal/main.py` | App factory, and serving the frontend export |
| `src/prelegal/config.py` | Paths, overridable by `PRELEGAL_*` env vars |
| `src/prelegal/db.py` | Connection handling and the schema |
| `src/prelegal/auth.py` | Password hashing, session tokens, and the `get_current_user` dependency |
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
| `tests/test_auth.py` | Hashing as a unit, then registering, signing in and out over HTTP |
| `tests/test_drafts.py` | Saving, listing, reopening and deleting — and that none of it crosses between users |
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
