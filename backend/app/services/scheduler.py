"""Scheduler — APScheduler hourly job to trigger weekly debriefs.

Runs every hour.  Each tick:
  1. Query users where the current UTC time ≥ Sunday 21:00 in the user's
     timezone AND no ``weekly_debriefs`` row exists for that
     ``(user_id, week_start)``.
  2. For each matching user call ``debrief_service.generate_weekly_debrief``.
  3. Idempotent: the unique constraint on ``(user_id, week_start)`` prevents
     any duplicate processing on overlap or retry.

Week definition (from the plan):
  - Monday through Sunday
  - ``week_start`` = Monday, ``week_end`` = Sunday
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.models import User, WeeklyDebrief

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Singleton scheduler instance
# ---------------------------------------------------------------------------
_scheduler: BackgroundScheduler | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _week_bounds_for(dt_local: datetime) -> tuple[datetime, datetime]:
    """Return ``(week_start_monday, week_end_sunday)`` as **date** objects for
    the ISO week containing *dt_local*.

    A week runs Monday→Sunday.
    """
    from datetime import date as _date

    d = dt_local.date()
    monday = d - timedelta(days=d.weekday())       # weekday 0 = Monday
    sunday = monday + timedelta(days=6)
    return monday, sunday                           # type: ignore[return-value]


def _is_debrief_due(user: User, utc_now: datetime) -> bool:
    """Return ``True`` when the current UTC time ≥ Sunday 21:00 in the user's
    timezone for the current ISO week."""
    try:
        tz = ZoneInfo(user.timezone or "America/New_York")
    except (KeyError, Exception):
        tz = ZoneInfo("America/New_York")

    local_now = utc_now.astimezone(tz)
    _, sunday = _week_bounds_for(local_now)

    # The debrief is "due" once local time passes Sunday 21:00
    due_at_local = datetime(sunday.year, sunday.month, sunday.day, 21, 0, 0, tzinfo=tz)
    return local_now >= due_at_local


# ---------------------------------------------------------------------------
# Hourly tick
# ---------------------------------------------------------------------------

def _hourly_tick() -> None:
    """Scan all users, trigger debrief generation for those who are due."""
    from app.services.debrief_service import generate_weekly_debrief

    logger.info("Scheduler tick — scanning for due debriefs")
    utc_now = datetime.now(ZoneInfo("UTC"))

    db: Session = SessionLocal()
    try:
        users: list[User] = db.execute(select(User)).scalars().all()  # type: ignore[assignment]
        triggered = 0

        for user in users:
            if not _is_debrief_due(user, utc_now):
                continue

            # Compute week bounds in user's local tz
            try:
                tz = ZoneInfo(user.timezone or "America/New_York")
            except (KeyError, Exception):
                tz = ZoneInfo("America/New_York")

            local_now = utc_now.astimezone(tz)
            week_start, week_end = _week_bounds_for(local_now)

            # Skip if debrief already exists for this week
            existing = db.execute(
                select(WeeklyDebrief).where(
                    and_(
                        WeeklyDebrief.user_id == user.id,
                        WeeklyDebrief.week_start == week_start,
                    )
                )
            ).scalar_one_or_none()

            if existing is not None:
                continue

            # Trigger async pipeline from synchronous scheduler thread
            logger.info(
                "Triggering debrief for user %s — week %s to %s",
                user.id, week_start, week_end,
            )
            try:
                asyncio.run(
                    generate_weekly_debrief(
                        db=db,
                        user_id=user.id,
                        week_start=week_start,
                        week_end=week_end,
                        send_email=True,
                    )
                )
                triggered += 1
            except Exception:
                logger.exception("Debrief failed for user %s", user.id)

        logger.info("Scheduler tick complete — %d debriefs triggered", triggered)

    finally:
        db.close()


# ---------------------------------------------------------------------------
# Start / stop (called from main.py lifespan)
# ---------------------------------------------------------------------------

def start_scheduler() -> None:
    """Start the background scheduler with the hourly debrief job."""
    global _scheduler
    if _scheduler is not None:
        logger.warning("Scheduler already running — skipping start")
        return

    _scheduler = BackgroundScheduler()
    _scheduler.add_job(
        _hourly_tick,
        trigger="interval",
        hours=1,
        id="debrief_hourly_tick",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("Debrief scheduler started (hourly interval)")


def stop_scheduler() -> None:
    """Gracefully shut down the scheduler."""
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("Debrief scheduler stopped")
