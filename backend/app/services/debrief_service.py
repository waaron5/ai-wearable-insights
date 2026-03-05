"""Debrief service — orchestrates the full weekly debrief pipeline.

Pipeline steps (from the plan):
  1. Idempotently create/fetch ``weekly_debriefs`` row → set ``generating``
  2–4. (Handled internally by metrics_engine via DB queries)
  5. Run ``metrics_engine`` → deterministic summary dict
  6. Run ``pii_scrubber`` → strip PII from summary
  7. Call ``HealthAIService.generate_debrief(summary)``
  8. Run ``safety_guardrails.post_filter`` → strip diagnoses + add disclaimer
  9. Store final ``{narrative, highlights}`` → status ``generated``
  10–11. Email via notification service → status ``sent``
  12. On failure → status ``failed``

Idempotency: The unique constraint ``(user_id, week_start)`` prevents
duplicate debriefs.  Status transitions ensure safe retries.
"""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.models import User, WeeklyDebrief
from app.services.ai.factory import get_ai_service
from app.services.anonymous_data_service import snapshot_weekly_health_data
from app.services.metrics_engine import compute_weekly_summary
from app.services.pii_scrubber import scrub_for_ai
from app.services.safety_guardrails import DISCLAIMER, post_filter

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Week helpers
# ---------------------------------------------------------------------------

def current_week_bounds(ref: date | None = None) -> tuple[date, date]:
    """Return ``(week_start, week_end)`` for the week containing *ref*.

    Week runs Monday (0) through Sunday (6).
    """
    if ref is None:
        ref = date.today()
    # Monday of the current week
    week_start = ref - timedelta(days=ref.weekday())
    week_end = week_start + timedelta(days=6)
    return week_start, week_end


# ---------------------------------------------------------------------------
# Idempotent debrief row management
# ---------------------------------------------------------------------------

def _get_or_create_debrief(
    db: Session,
    user_id: uuid.UUID,
    week_start: date,
    week_end: date,
) -> WeeklyDebrief:
    """Fetch or create the debrief row, idempotently.

    If a row already exists with status ``generated`` or ``sent``, it is
    returned as-is (no re-generation).  If ``pending`` or ``failed``, it is
    reused for a retry.
    """
    debrief = (
        db.query(WeeklyDebrief)
        .filter(
            WeeklyDebrief.user_id == user_id,
            WeeklyDebrief.week_start == week_start,
        )
        .first()
    )

    if debrief is None:
        debrief = WeeklyDebrief(
            user_id=user_id,
            week_start=week_start,
            week_end=week_end,
            status="pending",
        )
        db.add(debrief)
        db.flush()  # ensure ID is assigned
        logger.info(
            "Created debrief row %s for user %s week %s",
            debrief.id, user_id, week_start,
        )

    return debrief


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def generate_weekly_debrief(
    db: Session,
    user_id: uuid.UUID,
    week_start: date | None = None,
    week_end: date | None = None,
    *,
    send_email: bool = True,
) -> WeeklyDebrief:
    """Run the full debrief pipeline for a single user.

    Args:
        db: Active SQLAlchemy session.
        user_id: Target user UUID.
        week_start: Monday of the target week (defaults to current week).
        week_end: Sunday of the target week (defaults to current week).
        send_email: Whether to send the email notification after generation.

    Returns:
        The ``WeeklyDebrief`` row (status will be ``generated`` or ``sent``).

    Raises:
        Exception: On AI or pipeline failures (debrief status set to ``failed``).
    """
    # Default to current week
    if week_start is None or week_end is None:
        week_start, week_end = current_week_bounds()

    # Step 1: idempotent row
    debrief = _get_or_create_debrief(db, user_id, week_start, week_end)

    # Skip if already successfully generated
    if debrief.status in ("generated", "sent"):
        logger.info(
            "Debrief %s already %s — skipping", debrief.id, debrief.status
        )
        return debrief

    # Transition to generating
    debrief.status = "generating"
    db.flush()

    try:
        # Steps 2–5: metrics engine (queries DB internally)
        summary = compute_weekly_summary(db, user_id, week_start, week_end)

        # Step 6: PII scrub
        clean_summary = scrub_for_ai(summary)

        # Step 7: AI call
        ai = get_ai_service()
        ai_result = await ai.generate_debrief(clean_summary)

        # Step 8: post-filter (strip diagnoses, medication refs)
        filtered_narrative = post_filter(ai_result.narrative)

        # Step 9: store final output — never store raw prompts
        debrief.narrative = filtered_narrative
        debrief.highlights = ai_result.highlights
        debrief.status = "generated"
        db.flush()

        logger.info("Debrief %s generated successfully", debrief.id)

        # Anonymous data lake: snapshot this week's wearable aggregates
        # (no-op if user has not consented to data sharing)
        try:
            snapshot_weekly_health_data(db, user_id, week_start, week_end)
        except Exception:
            logger.exception(
                "Anonymous health snapshot failed for user %s — non-blocking",
                user_id,
            )

        # Steps 10–11: email notification
        if send_email:
            await _send_debrief_email(db, debrief)

        db.commit()
        db.refresh(debrief)
        return debrief

    except Exception:
        # Step 12: mark failed
        logger.exception("Debrief generation failed for user %s", user_id)
        debrief.status = "failed"
        db.commit()
        raise


async def _send_debrief_email(db: Session, debrief: WeeklyDebrief) -> None:
    """Send the debrief notification email and update status."""
    try:
        from app.services.notification_service import send_debrief_email

        # Load the user for email/notification prefs
        user = db.query(User).filter(User.id == debrief.user_id).one()

        await send_debrief_email(user, debrief)

        debrief.email_sent_at = datetime.now(timezone.utc)
        debrief.status = "sent"
        db.flush()

        logger.info("Debrief email sent for debrief %s", debrief.id)
    except Exception:
        logger.exception("Failed to send email for debrief %s", debrief.id)
        # Email failure should not roll back the generated debrief


def get_weekly_summary(
    db: Session,
    user_id: uuid.UUID,
    week_start: date | None = None,
    week_end: date | None = None,
) -> dict:
    """Return the deterministic metrics engine output for a week.

    This is the pure-computation path used by ``GET /debriefs/weekly-summary``
    — no AI call, no side effects.
    """
    if week_start is None or week_end is None:
        week_start, week_end = current_week_bounds()

    summary = compute_weekly_summary(db, user_id, week_start, week_end)
    summary["disclaimer"] = DISCLAIMER
    return summary


def get_current_debrief(
    db: Session,
    user_id: uuid.UUID,
) -> WeeklyDebrief | None:
    """Return this week's debrief (if it exists and is generated/sent)."""
    week_start, _ = current_week_bounds()
    return (
        db.query(WeeklyDebrief)
        .filter(
            WeeklyDebrief.user_id == user_id,
            WeeklyDebrief.week_start == week_start,
            WeeklyDebrief.status.in_(["generated", "sent"]),
        )
        .first()
    )


def list_debriefs(
    db: Session,
    user_id: uuid.UUID,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[WeeklyDebrief], int]:
    """Paginated list of debriefs for a user, newest first.

    Returns ``(items, total_count)``.
    """
    query = (
        db.query(WeeklyDebrief)
        .filter(WeeklyDebrief.user_id == user_id)
        .order_by(WeeklyDebrief.week_start.desc())
    )
    total = query.count()
    items = query.offset(offset).limit(limit).all()
    return items, total
