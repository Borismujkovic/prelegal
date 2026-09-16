"""The assistant that helps someone pick a document (PL-6).

Stateless in the same way the drafting chats are: the browser resends the
conversation, and nothing about it is kept here.
"""

from fastapi import APIRouter, HTTPException

from prelegal import llm, triage
from prelegal.models import AssistantChatRequest, AssistantTurn

router = APIRouter(prefix="/api", tags=["assistant"])


@router.post("/assistant/chat", response_model=AssistantTurn)
def assistant_chat(request: AssistantChatRequest) -> AssistantTurn:
    """Answer one triage message, and recommend a document if one fits."""
    try:
        return triage.run_turn(request.messages)
    except llm.LlmNotConfigured as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "The AI assistant is not configured on this server. "
                "Set OPENROUTER_API_KEY and restart."
            ),
        ) from exc
    except llm.LlmRequestFailed as exc:
        raise HTTPException(
            status_code=502,
            detail="The AI assistant is unavailable right now. Please try again.",
        ) from exc
