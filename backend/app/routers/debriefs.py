"""Debriefs router — list, current, weekly-summary, trigger, feedback.

Endpoints:
  GET  /debriefs                     — paginated list, newest first
  GET  /debriefs/current             — this week's debrief
  GET  /debriefs/weekly-summary      — deterministic engine output (no AI)
  POST /debriefs/trigger             — manually trigger debrief generation
  POST /debriefs/{debrief_id}/feedback — submit rating + optional comment
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_id
from app.core.database import get_db
from app.models.models import DebriefFeedback, WeeklyDebrief
from app.schemas.common import PaginatedResponse
from app.schemas.debriefs import (
    DebriefResponse,
    FeedbackCreate,
    FeedbackResponse,
    TriggerRequest,
    WeeklySummaryResponse,
)
from app.services.debrief_service import (
    current_week_bounds,
    generate_weekly_debrief,
    get_current_debrief,
    get_weekly_summary,
    list_debriefs,
)
from app.services.safety_guardrails import DISCLAIMER

router = APIRouter(prefix="/debriefs", tags=["debriefs"])


# ---------------------------------------------------------------------------
# GET /debriefs — paginated list
# ---------------------------------------------------------------------------

@router.get("", response_model=PaginatedResponse[DebriefResponse])
def get_debriefs(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Paginated list of user's debriefs, newest first."""
    items, total = list_debriefs(db, user_id, limit=limit, offset=offset)
    return PaginatedResponse(items=items, total=total)


# ---------------------------------------------------------------------------
# GET /debriefs/current — this week's generated debrief
# ---------------------------------------------------------------------------

@router.get("/current", response_model=DebriefResponse | None)
def get_current(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Return this week's debrief if it has been generated."""
    debrief = get_current_debrief(db, user_id)
    if debrief is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No debrief available for the current week",
        )
    return debrief


# ---------------------------------------------------------------------------
# GET /debriefs/weekly-summary — deterministic engine output, no AI
# ---------------------------------------------------------------------------

@router.get("/weekly-summary", response_model=WeeklySummaryResponse)
def weekly_summary(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Return the deterministic metrics engine output for the current week.

    Pure computation — no AI call.  Includes composite scores, per-metric
    stats, notable days, and prior-week averages.
    """
    return get_weekly_summary(db, user_id)


# ---------------------------------------------------------------------------
# POST /debriefs/trigger — manual generation (dev/testing)
# ---------------------------------------------------------------------------

@router.post("/trigger", response_model=DebriefResponse, status_code=201)
async def trigger_debrief(
    body: TriggerRequest | None = None,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Manually trigger debrief generation for the authenticated user.

    Defaults to the current week.  Idempotent — will not regenerate if
    the debrief already exists with status ``generated`` or ``sent``.
    """
    week_start = body.week_start if body else None
    week_end = body.week_end if body else None
    send_email = body.send_email if body else False

    debrief = await generate_weekly_debrief(
        db,
        user_id,
        week_start=week_start,
        week_end=week_end,
        send_email=send_email,
    )
    return debrief


# ---------------------------------------------------------------------------
# POST /debriefs/{debrief_id}/feedback — submit/upsert feedback
# ---------------------------------------------------------------------------

@router.post(
    "/{debrief_id}/feedback",
    response_model=FeedbackResponse,
    status_code=201,
)
def submit_feedback(
    debrief_id: uuid.UUID,
    body: FeedbackCreate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Submit or update feedback for a debrief.

    Upserts on ``(debrief_id, user_id)`` — resubmitting replaces the
    previous rating/comment.
    """
    # Verify the debrief belongs to this user
    debrief = (
        db.query(WeeklyDebrief)
        .filter(
            WeeklyDebrief.id == debrief_id,
            WeeklyDebrief.user_id == user_id,
        )
        .first()
    )
    if debrief is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Debrief not found",
        )

    # Upsert feedback
    stmt = pg_insert(DebriefFeedback).values(
        debrief_id=debrief_id,
        user_id=user_id,
        rating=body.rating,
        comment=body.comment,
    )
    stmt = stmt.on_conflict_do_update(
        constraint="uq_debrief_feedback_debrief_user",
        set_={"rating": body.rating, "comment": body.comment},
    ).returning(DebriefFeedback)

    row = db.execute(stmt).scalars().first()
    db.commit()
    db.refresh(row)
    return row
