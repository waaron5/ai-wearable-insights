"""Debrief schemas — response models for debriefs, feedback, and weekly summary."""

import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Debrief responses
# ---------------------------------------------------------------------------

class DebriefResponse(BaseModel):
    """Single debrief in list/detail responses."""

    id: uuid.UUID
    user_id: uuid.UUID
    week_start: date
    week_end: date
    narrative: str | None = None
    highlights: list[dict[str, Any]] | None = None
    status: str
    email_sent_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    disclaimer: str = (
        "This is not medical advice. "
        "Consult a healthcare professional for medical concerns."
    )

    model_config = {"from_attributes": True}


class WeeklySummaryResponse(BaseModel):
    """Deterministic metrics engine output — no AI, pure computed data."""

    week: str
    insufficient_data: bool
    composite_scores: dict[str, int | None]
    per_metric: list[dict[str, Any]]
    notable_days: list[dict[str, Any]]
    prior_week_avgs: dict[str, float | None]
    disclaimer: str


# ---------------------------------------------------------------------------
# Feedback
# ---------------------------------------------------------------------------

class FeedbackCreate(BaseModel):
    """POST body for submitting debrief feedback."""

    rating: int = Field(ge=1, le=5)
    comment: str | None = None


class FeedbackResponse(BaseModel):
    """Feedback confirmation response."""

    id: uuid.UUID
    debrief_id: uuid.UUID
    user_id: uuid.UUID
    rating: int
    comment: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Trigger
# ---------------------------------------------------------------------------

class TriggerRequest(BaseModel):
    """Optional body for POST /debriefs/trigger."""

    week_start: date | None = None
    week_end: date | None = None
    send_email: bool = False
