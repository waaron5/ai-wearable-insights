"""Survey schemas — questions, responses, and consent."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


# ── Survey Questions ──────────────────────────────────────────────────

class SurveyQuestionResponse(BaseModel):
    id: uuid.UUID
    category: str
    question_text: str
    response_type: str  # scale, single_choice, multi_choice, free_text
    options: dict | None = None
    display_order: int

    model_config = {"from_attributes": True}


# ── Survey Responses ──────────────────────────────────────────────────

class SurveyAnswerCreate(BaseModel):
    """A single answer submitted by the user."""
    question_id: uuid.UUID
    response_value: str = Field(..., min_length=1, max_length=2000)


class SurveySubmission(BaseModel):
    """Batch of answers submitted together (onboarding or check-in)."""
    answers: list[SurveyAnswerCreate] = Field(..., min_length=1, max_length=20)
    survey_context: str = Field(..., pattern=r"^(onboarding|periodic_checkin)$")


class SurveyResponseOut(BaseModel):
    id: uuid.UUID
    question_id: uuid.UUID
    response_value: str
    survey_context: str
    responded_at: datetime

    model_config = {"from_attributes": True}


# ── Consent ───────────────────────────────────────────────────────────

class ConsentUpdate(BaseModel):
    """Explicit opt-in / opt-out for anonymous data sharing."""
    data_sharing_consent: bool
