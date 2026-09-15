"""The Mutual NDA chat (PL-5).

Stateless by design: the browser holds the conversation and the Cover Page and
resends both every turn, so this router owns no session and stores nothing. Its
whole job is translating between HTTP and `prelegal.llm`, which is where the
prompt and the model call live so that they can be exercised without an app.

Scoped to the Mutual NDA. The path names the document rather than assuming it,
so the other ten can take the same shape once their cover pages are sourced.
"""

from fastapi import APIRouter, HTTPException

from prelegal import llm
from prelegal.models import ChatRequest, ChatTurn

router = APIRouter(prefix="/api", tags=["chat"])


@router.post(
    "/documents/mutual-nda/chat",
    response_model=ChatTurn,
    response_model_exclude_none=True,
)
def mutual_nda_chat(request: ChatRequest) -> ChatTurn:
    """Answer one message and report the Cover Page values it established."""
    try:
        return llm.run_turn(request.messages, request.values)
    except llm.LlmNotConfigured as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "The AI assistant is not configured on this server. "
                "Set OPENROUTER_API_KEY and restart."
            ),
        ) from exc
    except llm.LlmRequestFailed as exc:
        # The cause is logged in prelegal.llm. It is deliberately not repeated
        # here: a provider error body can carry request internals, and the user
        # can do nothing with it either way.
        raise HTTPException(
            status_code=502,
            detail="The AI assistant is unavailable right now. Please try again.",
        ) from exc
