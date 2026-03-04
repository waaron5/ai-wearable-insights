"""Chat schemas — sessions, messages, and chat response models."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

class SessionCreate(BaseModel):
    """POST body for creating a new chat session."""
    title: str | None = None


class SessionResponse(BaseModel):
    """Chat session in list/detail responses."""
    id: uuid.UUID
    user_id: uuid.UUID
    title: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------

class MessageCreate(BaseModel):
    """POST body for sending a chat message."""
    content: str = Field(min_length=1, max_length=4000)


class MessageResponse(BaseModel):
    """Single chat message."""
    id: uuid.UUID
    session_id: uuid.UUID
    user_id: uuid.UUID
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Chat reply — returned by POST /chat/sessions/{id}/messages
# ---------------------------------------------------------------------------

class ChatReplyResponse(BaseModel):
    """Normal AI chat response."""
    answer: str
    disclaimer: str
    user_message: MessageResponse
    assistant_message: MessageResponse


class EmergencyResponse(BaseModel):
    """Emergency bypass response — AI was not called."""
    emergency: bool = True
    message: str
    hotlines: list[dict[str, str]]
    disclaimer: str
    user_message: MessageResponse
    assistant_message: MessageResponse
