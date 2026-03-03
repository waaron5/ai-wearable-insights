"""Onboarding router — POST /onboarding/seed-demo."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_id
from app.core.database import get_db
from app.models.models import DataSource
from app.schemas.sources import SourceResponse
from app.seed import seed_demo_data_for_user

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


@router.post("/seed-demo", response_model=SourceResponse, status_code=201)
def seed_demo(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Generate 90 days of demo health data for the authenticated user.
    Creates a manual data source, metrics, and baselines.
    Idempotent: returns existing source if demo data was already seeded.
    """
    # Check if user already has a demo data source
    existing = (
        db.query(DataSource)
        .filter(
            DataSource.user_id == user_id,
            DataSource.source_type == "manual",
        )
        .first()
    )
    if existing:
        return existing

    source = seed_demo_data_for_user(db, user_id)
    return source
