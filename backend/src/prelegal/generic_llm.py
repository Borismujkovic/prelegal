"""The assistant behind every document except the Mutual NDA.

Same shape as `llm.py` — one LiteLLM call per turn, through OpenRouter to
gpt-oss-120b on Cerebras, with Structured Outputs so the reply and the values it
established come back as one object and cannot disagree. The difference is that
nothing here names a field: the prompt and the response schema are both built
from the document's spec, so the same code drafts a Pilot Agreement and a BAA.

`llm.py` is left alone rather than generalised. It is the one implementation
that has been exercised against the real provider and is covered by a parity
suite; the Mutual NDA's two term fields are tagged unions that no other document
has, and folding them into a string-keyed engine would mean special-casing the
very document the engine was supposed to stop being special. The cost is that
the two modules look alike, which is a cost worth paying once.

Stateless, like the NDA chat: the browser resends the conversation and the
values, and the prompt is rebuilt from them each turn, so a value typed into the
form is visible to the assistant on the very next turn without being announced.
"""

import logging
from datetime import date

from litellm import completion

from prelegal.catalog import load_catalog
from prelegal.config import settings
from prelegal.conversation import ensure_follow_up_question
from prelegal.document_specs import DocumentSpec, get_document_spec
from prelegal.dynamic_models import turn_model_for
from prelegal.llm import (
    EXTRA_BODY,
    MODEL,
    TIMEOUT_SECONDS,
    LlmNotConfigured,
    LlmRequestFailed,
)
from prelegal.models import ChatMessage, DocumentChatTurn, GenericValues, Party

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are Prelegal's drafting assistant. You are helping someone fill in the \
{tier} of a Common Paper {name} by talking to them.

{summary}

The Standard Terms of the agreement are fixed boilerplate and are not up for \
discussion. Only the {tier} values below change.{attaches}

How to talk
- Ask about one thing at a time, two at most when they naturally pair. Work \
down the outstanding list below, but follow the user's lead if they jump ahead \
or answer several things at once.
- Keep replies to one to three sentences, then your question. No bullet lists, \
no restating the whole document back at them.
- Open by asking who the two sides are and what the arrangement is for.
- If anything at all is still outstanding, end your reply with a question. \
Never end on a flat statement while something remains unanswered — the user \
cannot tell it is their turn, or what you want from them.
- Set `needsFollowUp` to true whenever anything required is still missing, and \
false only when the document is complete.

Filling in fields
- Put a value in `patch` only when the user's latest message actually gave it, \
changed it, or confirmed it. Leave everything else null, including values you \
can see are already filled in. The patch is a diff, not a summary.
- Never invent a company name, a person, an address, or the substance of the \
deal. Those are facts only the user has. Ask.
- When the user is unsure about a legal choice, you may say what is commonly \
done, but say plainly that it is common practice and not legal advice, and set \
it only once they accept it.
- `party1` is {party1}, `party2` is {party2}. `company` is the legal entity \
signing; `name` is the individual human who signs for it. If they give you only \
a company, set `company` and leave `name` null.
- Any date must be an ISO date, yyyy-mm-dd. Resolve "today", "next Monday" and \
the like against today's date below.

Finishing
- When nothing required is outstanding, say so, set `needsFollowUp` to false, \
and tell them they can download the document from the preview beside the chat. \
Mention that anything can still be changed, either by telling you or in the \
"Edit fields manually" panel under the chat.

Today's date is {today}.

The {tier} as it stands:
{state}
"""

#: Said of an addendum, which cannot stand on its own.
_ATTACHES = (
    " This agreement attaches to a {primary}, which the two sides are assumed "
    "to have already signed — so do not try to negotiate that agreement here."
)


def _primary_agreement_name(document_id: str) -> str:
    """The catalog's name for the agreement an addendum attaches to.

    Worth the lookup rather than un-hyphenating the id: the prompt reads better
    naming a "Cloud Service Agreement" than a "cloud service agreement", and the
    catalog is already the source of truth for what each document is called.
    """
    for entry in load_catalog().documents:
        if entry.id == document_id:
            return entry.name
    return document_id.replace("-", " ")


def _describe_party(party: Party, role: str, wants_notice: bool) -> str:
    """One signatory block, saying what is outstanding as well as what is known.

    Listing only what is filled in was not enough: an assistant told
    "Provider: company=Acme" reads the party as settled and moves on, leaving
    the signatory and — where the agreement substitutes one — the notice address
    blank in the finished document.

    `wants_notice` is true only when this agreement actually references a Notice
    Address, so the assistant does not chase an address for an addendum whose
    notice terms live in the agreement above it.
    """
    fields = [
        ("company", party.company),
        ("name of the person signing", party.name),
        ("their title", party.title),
    ]
    if wants_notice:
        fields.append(("notice address", party.noticeAddress))

    known = [f"{label}={value}" for label, value in fields if value.strip()]
    outstanding = [label for label, value in fields if not value.strip()]

    if not known:
        return f"- {role}: nothing yet"
    described = ", ".join(known)
    if outstanding:
        described += f" (still needed: {', '.join(outstanding)})"
    return f"- {role}: {described}"


def describe_values(spec: DocumentSpec, values: GenericValues) -> str:
    """The status list the prompt embeds.

    Written as prose, and grouped the way the form groups it, because the
    assistant has to reason about what is *outstanding* — and "nothing yet" says
    that far more plainly to a language model than an empty string does.
    """
    wants_notice = "Notice Address" in spec.derived
    lines: list[str] = [
        _describe_party(values.party1, spec.parties[0].label, wants_notice),
        _describe_party(values.party2, spec.parties[1].label, wants_notice),
    ]

    for section in spec.sections:
        lines.append(f"\n{section.title}:")
        for field in section.fields:
            value = values.fields.get(field.id, "").strip()
            suffix = " (optional)" if field.optional else ""
            lines.append(f"- {field.label}{suffix}: {value or 'nothing yet'}")

    return "\n".join(lines)


def build_messages(
    spec: DocumentSpec,
    messages: list[ChatMessage],
    values: GenericValues,
    today: date | None = None,
) -> list[dict[str, str]]:
    """The system prompt, then the conversation as the browser sent it."""
    attaches = (
        _ATTACHES.format(primary=_primary_agreement_name(spec.attaches_to))
        if spec.attaches_to
        else ""
    )

    system = SYSTEM_PROMPT.format(
        name=spec.name,
        summary=spec.summary,
        tier=spec.tier,
        attaches=attaches,
        party1=spec.parties[0].label,
        party2=spec.parties[1].label,
        today=(today or date.today()).isoformat(),
        state=describe_values(spec, values),
    )
    return [
        {"role": "system", "content": system},
        *({"role": message.role, "content": message.content} for message in messages),
    ]


def run_turn(
    document_id: str, messages: list[ChatMessage], values: GenericValues
) -> DocumentChatTurn:
    """Answer one user message about one document, and report what it established."""
    spec = get_document_spec(document_id)

    if not settings.openrouter_api_key:
        raise LlmNotConfigured("OPENROUTER_API_KEY is not set")

    turn_model = turn_model_for(document_id)

    try:
        response = completion(
            model=MODEL,
            messages=build_messages(spec, messages, values),
            response_format=turn_model,
            reasoning_effort="low",
            extra_body=EXTRA_BODY,
            timeout=TIMEOUT_SECONDS,
        )
        turn = turn_model.model_validate_json(response.choices[0].message.content)
    except Exception as exc:  # noqa: BLE001 — as in llm.run_turn.
        # LiteLLM raises a wide family of exceptions and the caller does the
        # same thing for all of them: apologise and invite a retry.
        logger.exception("%s chat turn failed", document_id)
        raise LlmRequestFailed(str(exc)) from exc

    # Nulls are stripped so the browser's shallow merge cannot blank a field the
    # user already gave — the same contract the Mutual NDA's patch has. A party
    # whose every field was null survives that as an empty object, which says
    # nothing and would still cost the browser a state write, so it goes too.
    patch = {
        key: value
        for key, value in turn.patch.model_dump(exclude_none=True).items()
        if value != {}
    }

    return DocumentChatTurn(
        reply=ensure_follow_up_question(turn.reply, turn.needsFollowUp),
        patch=patch,
        needsFollowUp=turn.needsFollowUp,
    )
