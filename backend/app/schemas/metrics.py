"""Health metrics schemas — GET /metrics query and POST /metrics body."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class MetricCreate(BaseModel):
    """Single metric entry in the POST body array."""
    date: date
    metric_type: str = Field(max_length=50)
    value: float
    source_id: uuid.UUID | None = None


class MetricResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    source_id: uuid.UUID | None
    date: date
    metric_type: str
    value: float
    created_at: datetime

    model_config = {"from_attributes": True}
