"""Sync router — GET /sync/status.

Returns last-updated timestamps for metrics, debriefs, and baselines
so the mobile app can decide what to refresh.
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_id
from app.core.database import get_db
from app.models.models import HealthMetric, UserBaseline, WeeklyDebrief

router = APIRouter(prefix="/sync", tags=["sync"])


class SyncStatus(BaseModel):
    last_metric_at: datetime | None
    last_debrief_at: datetime | None
    last_baseline_at: datetime | None

    model_config = {"from_attributes": True}


@router.get("/status", response_model=SyncStatus)
def get_sync_status(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Return the most recent timestamps for the user's data.

    Helps the mobile client decide which data to refresh, avoiding
    unnecessary network requests.
    """
    last_metric_at = (
        db.query(func.max(HealthMetric.created_at))
        .filter(HealthMetric.user_id == user_id)
        .scalar()
    )

    last_debrief_at = (
        db.query(func.max(WeeklyDebrief.updated_at))
        .filter(WeeklyDebrief.user_id == user_id)
        .scalar()
    )

    last_baseline_at = (
        db.query(func.max(UserBaseline.calculated_at))
        .filter(UserBaseline.user_id == user_id)
        .scalar()
    )

    return SyncStatus(
        last_metric_at=last_metric_at,
        last_debrief_at=last_debrief_at,
        last_baseline_at=last_baseline_at,
    )
