"""Anonymous data service — HMAC-based de-identification and data lake writes.

This module handles:
1. Deriving anonymous profile IDs from user IDs via HMAC-SHA256
2. Creating / fetching anonymous profiles
3. Copying survey responses into the anonymous data lake (de-identified)
4. Snapshotting weekly wearable aggregates into the anonymous data lake

Key invariant: anonymous_profiles has **NO foreign key** to users.
The only link is the deterministic HMAC, which requires the server secret
to compute.  Without the secret the mapping is irreversible.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import statistics
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.models import (
    AnonymousHealthData,
    AnonymousProfile,
    AnonymousSurveyData,
    HealthMetric,
    SurveyResponse,
    User,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# HMAC-based anonymous ID derivation
# ---------------------------------------------------------------------------

def _derive_anonymous_id(user_id: uuid.UUID) -> uuid.UUID:
    """Derive a deterministic anonymous profile UUID from a user UUID.

    Uses HMAC-SHA256 with the ``ANONYMOUS_ID_SECRET`` env var as the key.
    The first 16 bytes of the HMAC digest are used to construct a UUID5-style
    identifier.  The same user always maps to the same anonymous ID, but the
    mapping cannot be reversed without the secret.
    """
    settings = get_settings()
    if not settings.ANONYMOUS_ID_SECRET:
        raise RuntimeError(
            "ANONYMOUS_ID_SECRET is not configured — cannot derive anonymous IDs"
        )
    digest = hmac.new(
        key=settings.ANONYMOUS_ID_SECRET.encode(),
        msg=str(user_id).encode(),
        digestmod=hashlib.sha256,
    ).digest()
    # Use first 16 bytes as a UUID
    return uuid.UUID(bytes=digest[:16])


# ---------------------------------------------------------------------------
# Profile management
# ---------------------------------------------------------------------------

def get_or_create_anonymous_profile(
    db: Session,
    user_id: uuid.UUID,
    demographic_bucket: str | None = None,
) -> AnonymousProfile:
    """Return (or create) the anonymous profile for a user."""
    anon_id = _derive_anonymous_id(user_id)
    profile = db.get(AnonymousProfile, anon_id)
    if profile is not None:
        return profile

    profile = AnonymousProfile(
        id=anon_id,
        demographic_bucket=demographic_bucket,
    )
    db.add(profile)
    db.flush()
    return profile


# ---------------------------------------------------------------------------
# Survey data → anonymous lake
# ---------------------------------------------------------------------------

def copy_survey_to_anonymous_lake(
    db: Session,
    user_id: uuid.UUID,
    response_ids: list[uuid.UUID],
) -> int:
    """Copy the specified survey responses into the anonymous data lake.

    Returns the number of rows written.
    """
    user = db.get(User, user_id)
    if user is None or not user.data_sharing_consent:
        return 0

    profile = get_or_create_anonymous_profile(db, user_id)

    responses = (
        db.query(SurveyResponse)
        .filter(
            SurveyResponse.id.in_(response_ids),
            SurveyResponse.user_id == user_id,
        )
        .all()
    )

    count = 0
    for resp in responses:
        anon_row = AnonymousSurveyData(
            anonymous_profile_id=profile.id,
            question_id=resp.question_id,
            response_value=resp.response_value,
        )
        db.add(anon_row)
        count += 1

    db.flush()
    logger.info(
        "Copied %d survey responses to anonymous lake for profile %s",
        count,
        profile.id,
    )
    return count


# ---------------------------------------------------------------------------
# Weekly health data → anonymous lake
# ---------------------------------------------------------------------------

def snapshot_weekly_health_data(
    db: Session,
    user_id: uuid.UUID,
    week_start: date,
    week_end: date,
) -> int:
    """Aggregate the user's health_metrics for the given week and upsert
    into the anonymous data lake.

    Only weekly statistical summaries are stored (avg, min, max, std_dev,
    sample_count) — never raw daily values.  This is the HIPAA Safe Harbor
    de-identification approach.

    Returns the number of metric-type rows written.
    """
    user = db.get(User, user_id)
    if user is None or not user.data_sharing_consent:
        return 0

    profile = get_or_create_anonymous_profile(db, user_id)

    # Fetch raw metrics for the week, grouped by metric_type
    rows = (
        db.query(HealthMetric.metric_type, HealthMetric.value)
        .filter(
            HealthMetric.user_id == user_id,
            HealthMetric.date >= week_start,
            HealthMetric.date <= week_end,
        )
        .all()
    )

    if not rows:
        return 0

    # Group by metric_type
    by_type: dict[str, list[float]] = {}
    for metric_type, value in rows:
        by_type.setdefault(metric_type, []).append(value)

    count = 0
    for metric_type, values in by_type.items():
        avg_val = statistics.mean(values)
        min_val = min(values)
        max_val = max(values)
        std_val = statistics.stdev(values) if len(values) > 1 else 0.0
        sample = len(values)

        stmt = pg_insert(AnonymousHealthData).values(
            anonymous_profile_id=profile.id,
            metric_type=metric_type,
            period_start=week_start,
            period_end=week_end,
            avg_value=round(avg_val, 2),
            min_value=round(min_val, 2),
            max_value=round(max_val, 2),
            std_deviation=round(std_val, 2),
            sample_count=sample,
        ).on_conflict_do_update(
            constraint="uq_anon_health_profile_metric_period",
            set_={
                "avg_value": round(avg_val, 2),
                "min_value": round(min_val, 2),
                "max_value": round(max_val, 2),
                "std_deviation": round(std_val, 2),
                "sample_count": sample,
                "collected_at": func.now(),
            },
        )
        db.execute(stmt)
        count += 1

    db.flush()
    logger.info(
        "Snapshot %d metric types for week %s→%s to anonymous lake (profile %s)",
        count,
        week_start,
        week_end,
        profile.id,
    )
    return count
