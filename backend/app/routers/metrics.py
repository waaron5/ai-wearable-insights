"""Metrics router — GET /metrics and POST /metrics with upsert."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_id
from app.core.database import get_db
from app.models.models import HealthMetric
from app.schemas.common import PaginatedResponse
from app.schemas.metrics import MetricCreate, MetricResponse

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("", response_model=PaginatedResponse[MetricResponse])
def list_metrics(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    metric_type: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    q = db.query(HealthMetric).filter(HealthMetric.user_id == user_id)

    if start_date:
        q = q.filter(HealthMetric.date >= start_date)
    if end_date:
        q = q.filter(HealthMetric.date <= end_date)
    if metric_type:
        q = q.filter(HealthMetric.metric_type == metric_type)

    total = q.count()
    items = q.order_by(HealthMetric.date.desc(), HealthMetric.metric_type).offset(offset).limit(limit).all()

    return PaginatedResponse(items=items, total=total)


@router.post("", response_model=list[MetricResponse], status_code=201)
def create_metrics(
    body: list[MetricCreate],
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Upsert metrics — ON CONFLICT (user_id, date, metric_type) UPDATE value."""
    results = []

    for entry in body:
        stmt = pg_insert(HealthMetric).values(
            user_id=user_id,
            date=entry.date,
            metric_type=entry.metric_type,
            value=entry.value,
            source_id=entry.source_id,
        )
        stmt = stmt.on_conflict_do_update(
            constraint="uq_health_metrics_user_date_type",
            set_={"value": entry.value, "source_id": entry.source_id},
        ).returning(HealthMetric)

        row = db.execute(stmt).scalars().first()
        results.append(row)

    db.commit()
    # Refresh all objects so relationships and server defaults are loaded
    for row in results:
        db.refresh(row)
    return results
