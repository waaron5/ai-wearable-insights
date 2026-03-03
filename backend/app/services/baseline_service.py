"""Baseline service — calculate rolling 30-day mean + std deviation per metric type."""

import uuid
from datetime import date, timedelta
from statistics import mean, pstdev

from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.models.models import HealthMetric, UserBaseline


def calculate_baselines(db: Session, user_id: uuid.UUID, as_of: date | None = None) -> list[UserBaseline]:
    """
    For each metric type the user has data for, compute mean + std deviation
    over the last 30 days and upsert into user_baselines.

    Returns the list of upserted UserBaseline rows.
    """
    if as_of is None:
        as_of = date.today()

    start = as_of - timedelta(days=30)

    # Fetch all metrics in the 30-day window grouped by type
    metrics = (
        db.query(HealthMetric)
        .filter(
            HealthMetric.user_id == user_id,
            HealthMetric.date >= start,
            HealthMetric.date <= as_of,
        )
        .all()
    )

    # Group values by metric_type
    by_type: dict[str, list[float]] = {}
    for m in metrics:
        by_type.setdefault(m.metric_type, []).append(m.value)

    results = []
    for metric_type, values in by_type.items():
        if len(values) < 2:
            avg = values[0] if values else 0.0
            std = 0.0
        else:
            avg = mean(values)
            std = pstdev(values)

        # Upsert: find existing or create
        baseline = (
            db.query(UserBaseline)
            .filter(
                UserBaseline.user_id == user_id,
                UserBaseline.metric_type == metric_type,
            )
            .first()
        )

        if baseline:
            baseline.baseline_value = round(avg, 2)
            baseline.std_deviation = round(std, 2)
        else:
            baseline = UserBaseline(
                user_id=user_id,
                metric_type=metric_type,
                baseline_value=round(avg, 2),
                std_deviation=round(std, 2),
            )
            db.add(baseline)

        results.append(baseline)

    db.commit()
    for b in results:
        db.refresh(b)

    return results
