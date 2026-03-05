"""User schemas — GET /users/me response and PATCH /users/me request."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    name: str | None
    timezone: str
    notification_email: str | None
    email_notifications_enabled: bool
    onboarded_at: datetime | None
    data_sharing_consent: bool
    data_sharing_consented_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    """Accepts any combination of these fields."""
    timezone: str | None = Field(default=None, max_length=64)
    notification_email: str | None = Field(default=None, max_length=320)
    email_notifications_enabled: bool | None = None
    onboarded_at: datetime | None = None
