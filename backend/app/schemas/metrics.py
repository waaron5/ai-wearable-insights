"""Health metrics schemas — GET /metrics query and POST /metrics body."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator


# Allowed metric types — validated at the schema level.
# New types can be added here with no migration.
ALLOWED_METRIC_TYPES = {"sleep_hours", "hrv", "resting_hr", "steps"}


class MetricCreate(BaseModel):
    """Single metric entry in the POST body array."""
    date: date
    metric_type: str = Field(max_length=50)
    value: float
    source_id: uuid.UUID | None = None

    @field_validator("metric_type")
    @classmethod
    def validate_metric_type(cls, v: str) -> str:
        if v not in ALLOWED_METRIC_TYPES:
            raise ValueError(f"metric_type must be one of {sorted(ALLOWED_METRIC_TYPES)}, got '{v}'")
        return v


class MetricResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    source_id: uuid.UUID | None
    date: date
    metric_type: str
    value: float
    created_at: datetime

    model_config = {"from_attributes": True}
