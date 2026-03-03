"""Data source schemas — GET /sources response and POST /sources body."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class SourceCreate(BaseModel):
    source_type: str = Field(max_length=50)
    config: dict[str, Any] | None = None


class SourceResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    source_type: str
    config: dict[str, Any] | None
    last_synced_at: datetime | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
