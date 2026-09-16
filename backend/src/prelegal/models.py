"""Request and response shapes.

Catalog models mirror catalog.json field-for-field, so the file itself stays the
source of truth and a malformed entry fails loudly at request time rather than
reaching the dashboard.

The chat models at the bottom mirror `frontend/src/lib/nda-fields.ts` just as
closely, camelCase included, so a Cover Page value crosses the wire in the shape
the browser already holds it in and nothing has to be translated on either side.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class SignInRequest(BaseModel):
    """What the fake login screen sends.

    No password field, by design — PL-4 specifies no authentication.
    """

    email: EmailStr
    display_name: str | None = Field(default=None, max_length=120)


class User(BaseModel):
    id: int
    email: str
    display_name: str
    created_at: str


class CatalogDocument(BaseModel):
    id: str
    name: str
    abbreviation: str | None
    summary: str
    use_when: str
    standard_terms: str
    cover_page: str | None
    attaches_to: str | None
    available: bool


class Catalog(BaseModel):
    version: int
    attribution: str
    documents: list[CatalogDocument]


class Health(BaseModel):
    status: str
    database: str
    catalog_documents: int


# --------------------------------------------------------------------------- #
# Mutual NDA chat (PL-5)
#
# The two term fields are tagged unions in the frontend, and they stay tagged
# unions here — including in the schema handed to the model for Structured
# Outputs. That was measured rather than assumed: gpt-oss-120b on Cerebras emits
# `{"kind": "fixed", "years": 3}` and `{"kind": "perpetual"}` correctly, so
# flattening them into a kind/years pair would buy nothing and cost a
# translation layer on one side of the wire or the other.
# --------------------------------------------------------------------------- #


class ChatMessage(BaseModel):
    """One turn of the conversation, as the browser remembers it.

    The role is deliberately narrow. A `system` role would let a request rewrite
    the instructions the assistant runs under, and the browser has no business
    doing that — the system prompt is composed server-side on every turn.
    """

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class FixedTerm(BaseModel):
    """Runs for a set number of years from the Effective Date."""

    kind: Literal["fixed"]
    years: int = Field(ge=1, le=99)


class UntilTerminated(BaseModel):
    """The MNDA continues until one side terminates it."""

    kind: Literal["untilTerminated"]


class Perpetual(BaseModel):
    """Confidentiality never lapses."""

    kind: Literal["perpetual"]


NdaTerm = Annotated[FixedTerm | UntilTerminated, Field(discriminator="kind")]
ConfidentialityTerm = Annotated[FixedTerm | Perpetual, Field(discriminator="kind")]


class Party(BaseModel):
    """One signatory block, as the Cover Page labels it."""

    name: str = ""
    title: str = ""
    company: str = ""
    noticeAddress: str = ""  # noqa: N815 — mirrors the frontend field name.


class CoverPageValues(BaseModel):
    """The Cover Page as it stands right now.

    Sent up with every turn. The backend keeps no conversation state, so this is
    how the assistant learns what has already been answered — including anything
    the user typed into the manual form rather than telling the assistant.
    """

    purpose: str = ""
    effectiveDate: str = ""  # noqa: N815
    ndaTerm: NdaTerm  # noqa: N815
    confidentialityTerm: ConfidentialityTerm  # noqa: N815
    governingLaw: str = ""  # noqa: N815
    jurisdiction: str = ""
    modifications: str = ""
    party1: Party
    party2: Party


class PartyPatch(BaseModel):
    """Party details the latest message established. Null means untouched."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, max_length=200)
    title: str | None = Field(default=None, max_length=200)
    company: str | None = Field(default=None, max_length=200)
    noticeAddress: str | None = Field(default=None, max_length=500)  # noqa: N815


class CoverPagePatch(BaseModel):
    """What one turn changed, and nothing else.

    Every field is optional, and an absent field means "leave this alone" rather
    than "clear this". That is what stops a turn about the governing law from
    wiping a party name the user gave three messages ago, and it lets the
    browser apply a patch through the same shallow merge the manual form uses.
    """

    model_config = ConfigDict(extra="forbid")

    purpose: str | None = Field(default=None, max_length=2000)
    effectiveDate: str | None = Field(  # noqa: N815
        default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"
    )
    ndaTerm: NdaTerm | None = None  # noqa: N815
    confidentialityTerm: ConfidentialityTerm | None = None  # noqa: N815
    governingLaw: str | None = Field(default=None, max_length=200)  # noqa: N815
    jurisdiction: str | None = Field(default=None, max_length=200)
    modifications: str | None = Field(default=None, max_length=2000)
    party1: PartyPatch | None = None
    party2: PartyPatch | None = None


class ChatTurn(BaseModel):
    """One turn's worth of output: what to say, and what it established.

    This is both the Structured Outputs schema handed to the model and the
    response body. `reply` is declared first so the model writes its prose
    before committing to field values rather than the other way round, and
    `needsFollowUp` last so it is decided in the light of what the turn actually
    changed.
    """

    reply: str = Field(max_length=2000)
    patch: CoverPagePatch
    needsFollowUp: bool  # noqa: N815 — mirrors the frontend field name.


class ChatRequest(BaseModel):
    """A chat turn, carrying everything the stateless backend needs."""

    messages: list[ChatMessage] = Field(min_length=1, max_length=60)
    values: CoverPageValues


# --------------------------------------------------------------------------- #
# The generic drafting engine (PL-6)
#
# The Mutual NDA's models above name their fields; these cannot, because the
# fields differ per document and are read from cover-pages/<id>.json at runtime.
# So values cross the wire as a plain mapping, keyed by the camelCase ids the
# overlay assigns. That is safe in this direction because Pydantic validates it
# here, against the document's own spec. It is emphatically not safe in the
# other direction — see dynamic_models.py for why the patch the model *returns*
# has every key enumerated instead.
# --------------------------------------------------------------------------- #


class GenericValues(BaseModel):
    """A document's values as they currently stand, resent with every turn.

    Two parts, deliberately: `fields` is open and per-document, the parties are
    fixed and shared. Every agreement here has exactly two sides, so one
    signature block serves all of them and `Party` is reused unchanged from the
    Mutual NDA rather than re-modelled per document.
    """

    fields: dict[str, Annotated[str, Field(max_length=4000)]] = Field(
        default_factory=dict, max_length=60
    )
    party1: Party = Field(default_factory=Party)
    party2: Party = Field(default_factory=Party)


class DocumentChatRequest(BaseModel):
    """One turn of drafting, for a document named in the path."""

    messages: list[ChatMessage] = Field(min_length=1, max_length=60)
    values: GenericValues = Field(default_factory=GenericValues)


class DocumentChatTurn(BaseModel):
    """What a drafting turn returns.

    `patch` is typed loosely here and strictly where it matters: the schema the
    model is actually held to is built per document in dynamic_models.py, and
    this shape is what survives being serialised back to the browser. Declaring
    the strict one here is impossible — there are five of them.
    """

    reply: str
    patch: dict[str, object]
    needsFollowUp: bool  # noqa: N815 — mirrors the frontend field name.


class AssistantChatRequest(BaseModel):
    """One turn with the assistant that helps pick a document.

    No values: this conversation fills nothing in, it only works out which
    agreement the user actually needs.
    """

    messages: list[ChatMessage] = Field(min_length=1, max_length=60)


class AssistantTurn(BaseModel):
    """A recommendation, and how much use it is.

    `status` is derived server-side from the catalog rather than asked of the
    model. Whether a document is available is something catalog.json knows for
    certain, and a model asked to report it would be a second source of truth
    that could disagree with the first.
    """

    reply: str
    recommendedDocumentId: str | None = None  # noqa: N815
    status: Literal["available", "not_yet_available", "no_recommendation"]
