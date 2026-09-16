"""The assistant that works out which agreement someone actually needs.

People arrive knowing their situation, not the name of the contract that covers
it — and sometimes what they want is not in the catalog at all. This answers
both cases: it recommends the closest agreement Prelegal can draft, and when the
honest answer is "we do not generate that", it says so and still points
somewhere useful rather than leaving them at a dead end.

Two design points worth stating plainly:

The recommended id is constrained to a `Literal` of the ids actually in the
catalog, so the model cannot invent a document. An id outside the enum fails
validation before it reaches the router, which is a stronger guarantee than
checking the value afterwards and hoping to have thought of every case.

Whether that document is *available* is not asked of the model at all. The
catalog knows for certain, so the status is computed here from it. Asking the
model would create a second source of truth that could disagree with the first
the moment a document's flag changes.
"""

import logging
from functools import lru_cache
from typing import Literal

from litellm import completion
from pydantic import BaseModel, Field, create_model

from prelegal.catalog import load_catalog
from prelegal.config import settings
from prelegal.conversation import ensure_follow_up_question
from prelegal.llm import (
    EXTRA_BODY,
    MODEL,
    TIMEOUT_SECONDS,
    LlmNotConfigured,
    LlmRequestFailed,
)
from prelegal.models import AssistantTurn, ChatMessage

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are Prelegal's front desk. Someone describes the situation they are in, and \
you work out which of the agreements below fits — or tell them plainly that \
Prelegal cannot draft what they are asking for.

The catalogue, and nothing else:
{catalogue}

How to answer
- Ask what the situation is: who the other side is, what is being exchanged, \
and whether anything is signed already. One or two questions at a time.
- When you are confident, set `recommendedDocumentId` and say in a sentence or \
two why that one fits.
- Some agreements are marked not yet draftable. You may still recommend one — \
say that it is coming rather than pretending it is ready — but if something \
draftable is a reasonable fit, prefer it and say why.
- If what they need is not in the catalogue at all — an employment contract, a \
lease, a will, a terms of service — say clearly that Prelegal does not generate \
that, and do not imply it might. Then offer the closest thing in the catalogue \
if there is one, being honest that it is adjacent rather than a substitute, and \
leave `recommendedDocumentId` null if nothing is genuinely close.
- Never draft or quote contract language here, and never give legal advice. \
This conversation only picks the document; the drafting happens afterwards.
- If you still need to know more before recommending anything, end your reply \
with a question and set `needsFollowUp` to true. Only set it to false once you \
have given them a recommendation or told them Prelegal cannot help.
"""


def describe_catalogue() -> str:
    """The catalogue as the prompt lists it, availability included."""
    lines = []
    for entry in load_catalog().documents:
        state = "draftable now" if entry.available else "not yet draftable"
        lines.append(
            f"- {entry.id} — {entry.name} ({state}). {entry.summary} "
            f"Use when: {entry.use_when}"
        )
    return "\n".join(lines)


@lru_cache(maxsize=1)
def _turn_model() -> type[BaseModel]:
    """The Structured Outputs schema, with the catalog baked into its enum."""
    ids = tuple(entry.id for entry in load_catalog().documents)

    model = create_model(
        "TriageTurn",
        reply=(str, Field(max_length=2000)),
        recommendedDocumentId=(Literal[ids] | None, None),  # noqa: N815
        needsFollowUp=(bool, ...),  # noqa: N815
    )
    model.__doc__ = (
        "One turn of triage. The recommended id is an enum of real catalog ids, "
        "so a document that does not exist cannot be recommended."
    )
    return model


def clear_cache() -> None:
    """Forget the built schema, so the next call rebuilds it.

    Only tests need this, and only because they point the catalog somewhere
    else between cases. The enum of recommendable ids is derived from the
    catalog, so leaving it cached would let one test's catalog decide which
    documents the next test's assistant believes in.
    """
    _turn_model.cache_clear()


def _status(document_id: str | None) -> Literal[
    "available", "not_yet_available", "no_recommendation"
]:
    if document_id is None:
        return "no_recommendation"
    for entry in load_catalog().documents:
        if entry.id == document_id:
            return "available" if entry.available else "not_yet_available"
    # Unreachable while the schema's enum is built from this same catalog, but
    # an id that survived validation and then vanished is not worth trusting.
    return "no_recommendation"


def build_messages(messages: list[ChatMessage]) -> list[dict[str, str]]:
    system = SYSTEM_PROMPT.format(catalogue=describe_catalogue())
    return [
        {"role": "system", "content": system},
        *({"role": message.role, "content": message.content} for message in messages),
    ]


def run_turn(messages: list[ChatMessage]) -> AssistantTurn:
    """Answer one triage message."""
    if not settings.openrouter_api_key:
        raise LlmNotConfigured("OPENROUTER_API_KEY is not set")

    turn_model = _turn_model()

    try:
        response = completion(
            model=MODEL,
            messages=build_messages(messages),
            response_format=turn_model,
            reasoning_effort="low",
            extra_body=EXTRA_BODY,
            timeout=TIMEOUT_SECONDS,
        )
        turn = turn_model.model_validate_json(response.choices[0].message.content)
    except Exception as exc:  # noqa: BLE001 — as in llm.run_turn.
        logger.exception("Triage turn failed")
        raise LlmRequestFailed(str(exc)) from exc

    return AssistantTurn(
        reply=ensure_follow_up_question(turn.reply, turn.needsFollowUp),
        recommendedDocumentId=turn.recommendedDocumentId,
        status=_status(turn.recommendedDocumentId),
    )
