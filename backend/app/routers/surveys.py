"""Surveys router — GET questions, POST answers, PATCH consent."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_id
from app.core.database import get_db
from app.models.models import SurveyQuestion, SurveyResponse, User
from app.schemas.surveys import (
    ConsentUpdate,
    SurveyQuestionResponse,
    SurveyResponseOut,
    SurveySubmission,
)
from app.services.anonymous_data_service import copy_survey_to_anonymous_lake

router = APIRouter(prefix="/surveys", tags=["surveys"])


# ── Questions ─────────────────────────────────────────────────────────

@router.get("/questions", response_model=list[SurveyQuestionResponse])
def list_questions(
    category: str | None = Query(None, description="Filter by category (diet, exercise, sleep, stress, lifestyle)"),
    context: str | None = Query(None, description="Filter by context: onboarding or periodic_checkin"),
    db: Session = Depends(get_db),
    _user_id: uuid.UUID = Depends(get_current_user_id),
):
    """Return active survey questions, optionally filtered by category."""
    q = db.query(SurveyQuestion).filter(SurveyQuestion.is_active.is_(True))
    if category:
        q = q.filter(SurveyQuestion.category == category)
    return q.order_by(SurveyQuestion.display_order).all()


# ── Responses ─────────────────────────────────────────────────────────

@router.post("/responses", response_model=list[SurveyResponseOut], status_code=201)
def submit_responses(
    body: SurveySubmission,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Submit a batch of survey answers.

    If the user has data-sharing consent enabled, the answers are also
    copied (de-identified) into the anonymous data lake.
    """
    # Validate all question IDs exist
    question_ids = {a.question_id for a in body.answers}
    existing = (
        db.query(SurveyQuestion.id)
        .filter(SurveyQuestion.id.in_(question_ids))
        .all()
    )
    existing_ids = {row[0] for row in existing}
    missing = question_ids - existing_ids
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown question IDs: {[str(m) for m in missing]}",
        )

    created: list[SurveyResponse] = []
    for answer in body.answers:
        resp = SurveyResponse(
            user_id=user_id,
            question_id=answer.question_id,
            response_value=answer.response_value,
            survey_context=body.survey_context,
        )
        db.add(resp)
        created.append(resp)

    db.flush()  # populate IDs

    # Copy to anonymous lake if consented
    response_ids = [r.id for r in created]
    copy_survey_to_anonymous_lake(db, user_id, response_ids)

    db.commit()
    for r in created:
        db.refresh(r)
    return created


@router.get("/responses", response_model=list[SurveyResponseOut])
def list_my_responses(
    survey_context: str | None = Query(None, pattern=r"^(onboarding|periodic_checkin)$"),
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Return the authenticated user's survey responses."""
    q = db.query(SurveyResponse).filter(SurveyResponse.user_id == user_id)
    if survey_context:
        q = q.filter(SurveyResponse.survey_context == survey_context)
    return q.order_by(SurveyResponse.responded_at.desc()).all()


# ── Consent ───────────────────────────────────────────────────────────

@router.patch("/consent", response_model=dict)
def update_consent(
    body: ConsentUpdate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Update the user's anonymous data-sharing consent."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    user.data_sharing_consent = body.data_sharing_consent
    if body.data_sharing_consent:
        user.data_sharing_consented_at = datetime.now(timezone.utc)
    else:
        user.data_sharing_consented_at = None

    db.commit()
    return {
        "data_sharing_consent": user.data_sharing_consent,
        "data_sharing_consented_at": (
            user.data_sharing_consented_at.isoformat()
            if user.data_sharing_consented_at
            else None
        ),
    }
