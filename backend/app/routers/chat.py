"""Chat router — sessions CRUD + message endpoint.

Endpoints:
  GET  /chat/sessions                       — paginated list of sessions
  POST /chat/sessions                       — create new session
  GET  /chat/sessions/{session_id}/messages  — paginated messages
  POST /chat/sessions/{session_id}/messages  — send message (emergency check → AI → filter)
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_id
from app.core.database import get_db
from app.schemas.chat import (
    ChatReplyResponse,
    EmergencyResponse,
    MessageCreate,
    MessageResponse,
    SessionCreate,
    SessionResponse,
)
from app.schemas.common import PaginatedResponse
from app.services.chat_service import (
    RateLimitExceeded,
    SessionNotFound,
    create_session,
    list_messages,
    list_sessions,
    send_message,
)

router = APIRouter(prefix="/chat", tags=["chat"])


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

@router.get("/sessions", response_model=PaginatedResponse[SessionResponse])
def get_sessions(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Paginated list of user's chat sessions, newest first."""
    items, total = list_sessions(db, user_id, limit=limit, offset=offset)
    return PaginatedResponse(items=items, total=total)


@router.post("/sessions", response_model=SessionResponse, status_code=201)
def new_session(
    body: SessionCreate | None = None,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Create a new chat session."""
    title = body.title if body else None
    return create_session(db, user_id, title=title)


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------

@router.get(
    "/sessions/{session_id}/messages",
    response_model=PaginatedResponse[MessageResponse],
)
def get_messages(
    session_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Paginated messages in a chat session (oldest first)."""
    try:
        items, total = list_messages(
            db, session_id, user_id, limit=limit, offset=offset,
        )
    except SessionNotFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat session not found",
        )
    return PaginatedResponse(items=items, total=total)


@router.post(
    "/sessions/{session_id}/messages",
    response_model=ChatReplyResponse | EmergencyResponse,
    status_code=201,
)
async def post_message(
    session_id: uuid.UUID,
    body: MessageCreate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Send a message in a chat session.

    Runs the emergency keyword check first — if triggered, the AI is
    bypassed and a hardcoded emergency response is returned.  Otherwise,
    the full chat pipeline runs (context → PII scrub → AI → post-filter).

    Returns either a ``ChatReplyResponse`` or an ``EmergencyResponse``.
    """
    try:
        result = await send_message(db, user_id, session_id, body.content)
    except SessionNotFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat session not found",
        )
    except RateLimitExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        )

    # Emergency path
    if result.get("emergency"):
        return EmergencyResponse(
            emergency=True,
            message=result["message"],
            hotlines=result["hotlines"],
            disclaimer=result["disclaimer"],
            user_message=result["user_msg"],
            assistant_message=result["assistant_msg"],
        )

    # Normal AI path
    return ChatReplyResponse(
        answer=result["answer"],
        disclaimer=result["disclaimer"],
        user_message=result["user_msg"],
        assistant_message=result["assistant_msg"],
    )
