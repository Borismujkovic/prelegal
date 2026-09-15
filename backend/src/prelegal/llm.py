"""The assistant behind the Mutual NDA chat.

One LiteLLM call per turn, routed through OpenRouter to gpt-oss-120b with
Cerebras as the inference provider, using Structured Outputs so the reply and
the field values it established come back as one object and cannot disagree.

Nothing is remembered between calls. The browser resends the conversation and
the Cover Page as it currently stands, and the system prompt is rebuilt from
those values every time — so the assistant is told plainly what is already
answered instead of having to infer it from the transcript. That also means a
value the user typed into the manual form is visible to the assistant on the
very next turn, without anything having to announce it.
"""

import logging
from datetime import date

from litellm import completion

from prelegal.config import settings
from prelegal.models import (
    ChatMessage,
    ChatTurn,
    CoverPageValues,
    FixedTerm,
    Party,
    Perpetual,
    UntilTerminated,
)

logger = logging.getLogger(__name__)

MODEL = "openrouter/openai/gpt-oss-120b"
EXTRA_BODY = {"provider": {"order": ["cerebras"]}}

#: A hung provider would otherwise hold the request open indefinitely; FastAPI
#: imposes no timeout of its own.
TIMEOUT_SECONDS = 45


class LlmNotConfigured(Exception):
    """No API key. Raised before any network call is attempted."""


class LlmRequestFailed(Exception):
    """The call failed, or its output did not parse as a ChatTurn."""


SYSTEM_PROMPT = """\
You are Prelegal's drafting assistant. You help someone fill in the Cover Page \
of a Common Paper Mutual Non-Disclosure Agreement by talking to them.

The Standard Terms of the agreement are fixed boilerplate and are not up for \
discussion. Only the Cover Page values below change. Prelegal has ten other \
agreements in its catalogue, none of them ready to draft yet, so if asked about \
one, say so briefly and return to the NDA.

How to talk
- Ask about one thing at a time, two at most when they naturally pair (a \
person's name and their title, say). Work down the outstanding list below, but \
follow the user's lead if they jump ahead or answer several things at once.
- Keep replies to one to three sentences, then your question. No bullet lists, \
no restating the whole document back at them.
- Open by asking what the agreement is for and who the two sides are. That \
single answer usually settles the purpose and both companies.

Filling in fields
- Put a value in `patch` only when the user's latest message actually gave it, \
changed it, or confirmed it. Leave everything else null, including values you \
can see are already filled in. The patch is a diff, not a summary.
- Never invent a party's name, company, address, or the purpose of the deal. \
Those are facts only the user has. Ask.
- When the user is unsure about a legal choice — term length, governing law, \
jurisdiction, confidentiality period — you may suggest what is commonly done, \
but say plainly that it is common practice and not legal advice, and set it \
only once they accept it. For example: "Most US companies pick Delaware here. \
That's common practice rather than legal advice — shall I put that in?"
- `party1` is the user's own side unless they say otherwise. `company` is the \
legal entity signing; `name` is the individual human who signs for it. If they \
give you only a company, set `company` and leave `name` null — do not put a \
company name in `name`.
- `effectiveDate` must be an ISO date, yyyy-mm-dd. Resolve "today", "next \
Monday" and the like against today's date given below.
- `ndaTerm` is either {{"kind": "fixed", "years": N}} or \
{{"kind": "untilTerminated"}}. `confidentialityTerm` is either \
{{"kind": "fixed", "years": N}} or {{"kind": "perpetual"}}. Both already carry a \
default of one year, so ask the user to confirm or change it rather than \
treating the default as their choice.
- `modifications` is optional and usually empty. Ask about it last, once, and \
accept "none" without pressing.

Finishing
- When nothing required is outstanding, say the cover page is complete and that \
they can download it from the preview beside the chat. Mention that anything \
can still be changed, either by telling you or in the "Edit fields manually" \
panel under the chat.

Today's date is {today}.

The Cover Page as it stands:
{state}
"""


def _describe_term(term: FixedTerm | UntilTerminated | Perpetual) -> str:
    """Render a term field the way the prompt's status list wants it.

    Both term fields start at one year, and a default the user has never seen is
    not a choice they made — so that case is reported as unconfirmed rather than
    answered, to stop the assistant treating it as settled and moving on.
    """
    if isinstance(term, FixedTerm):
        if term.years == 1:
            return "fixed, 1 year (still the default of 1 year — confirm or change)"
        return f"fixed, {term.years} years"
    if isinstance(term, UntilTerminated):
        return "continues until terminated"
    return "in perpetuity"


def _describe_party(party: Party, label: str) -> str:
    known = [
        f"{field}={value}"
        for field, value in (
            ("company", party.company),
            ("name", party.name),
            ("title", party.title),
            ("notice address", party.noticeAddress),
        )
        if value.strip()
    ]
    return f"{label}: {', '.join(known)}" if known else f"{label}: nothing yet"


def describe_values(values: CoverPageValues) -> str:
    """The status list the system prompt embeds.

    Written as prose rather than dumped as JSON because the assistant has to
    reason about what is *outstanding*, and "nothing yet" says that far more
    plainly to a language model than an empty string does.
    """
    lines = [
        f"- Purpose: {values.purpose or 'nothing yet'}",
        f"- Effective Date: {values.effectiveDate or 'nothing yet'}",
        f"- MNDA Term: {_describe_term(values.ndaTerm)}",
        f"- Term of Confidentiality: {_describe_term(values.confidentialityTerm)}",
        f"- Governing Law: {values.governingLaw or 'nothing yet'}",
        f"- Jurisdiction: {values.jurisdiction or 'nothing yet'}",
        f"- {_describe_party(values.party1, 'Party 1')}",
        f"- {_describe_party(values.party2, 'Party 2')}",
        f"- Modifications: {values.modifications or 'none noted (optional)'}",
    ]
    return "\n".join(lines)


def build_messages(
    messages: list[ChatMessage],
    values: CoverPageValues,
    today: date | None = None,
) -> list[dict[str, str]]:
    """The system prompt, then the conversation as the browser sent it."""
    system = SYSTEM_PROMPT.format(
        today=(today or date.today()).isoformat(),
        state=describe_values(values),
    )
    return [
        {"role": "system", "content": system},
        *({"role": message.role, "content": message.content} for message in messages),
    ]


def run_turn(messages: list[ChatMessage], values: CoverPageValues) -> ChatTurn:
    """Answer one user message, and report what it established."""
    if not settings.openrouter_api_key:
        raise LlmNotConfigured("OPENROUTER_API_KEY is not set")

    try:
        response = completion(
            model=MODEL,
            messages=build_messages(messages, values),
            response_format=ChatTurn,
            reasoning_effort="low",
            extra_body=EXTRA_BODY,
            timeout=TIMEOUT_SECONDS,
        )
        return ChatTurn.model_validate_json(response.choices[0].message.content)
    except Exception as exc:  # noqa: BLE001 — see below.
        # LiteLLM raises a wide family of exceptions (timeouts, rate limits,
        # provider auth, malformed output) and the caller does the same thing
        # for all of them: apologise and invite a retry. The distinction is
        # worth logging, not worth branching on.
        logger.exception("Mutual NDA chat turn failed")
        raise LlmRequestFailed(str(exc)) from exc
