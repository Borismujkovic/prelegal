"""Drafting chat for every document except the Mutual NDA (PL-6).

Stateless, like the NDA chat it is modelled on: the browser holds the
conversation and the values and resends both every turn, so this router owns no
session and stores nothing.

Registered *after* `routers/chat.py`. Starlette matches routes in the order they
were added with no preference for a more specific path, so the literal
`/api/documents/mutual-nda/chat` only keeps winning because it was registered
first. That ordering is load-bearing, and `tests/test_documents_chat.py` pins it.

Even if it were reached, `mutual-nda` is never a key in the generic registry, so
it would 404 through the ordinary "not something we draft" path rather than
being answered by the wrong engine.
"""

from fastapi import APIRouter, HTTPException

from prelegal import generic_llm, llm
from prelegal.document_specs import DocumentNotAvailable, UnknownDocument
from prelegal.models import DocumentChatRequest, DocumentChatTurn

router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/documents/{document_id}/chat", response_model=DocumentChatTurn)
def document_chat(document_id: str, request: DocumentChatRequest) -> DocumentChatTurn:
    """Answer one message and report the values it established."""
    try:
        return generic_llm.run_turn(document_id, request.messages, request.values)
    except UnknownDocument as exc:
        raise HTTPException(
            status_code=404, detail=f"There is no document called '{document_id}'."
        ) from exc
    except DocumentNotAvailable as exc:
        raise HTTPException(
            status_code=404,
            detail=f"'{document_id}' is in the catalog but cannot be drafted yet.",
        ) from exc
    except llm.LlmNotConfigured as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "The AI assistant is not configured on this server. "
                "Set OPENROUTER_API_KEY and restart."
            ),
        ) from exc
    except llm.LlmRequestFailed as exc:
        # The cause is logged in prelegal.generic_llm and deliberately not
        # repeated: a provider error body can carry request internals, and the
        # user can do nothing with it either way.
        raise HTTPException(
            status_code=502,
            detail="The AI assistant is unavailable right now. Please try again.",
        ) from exc
