"""Chat service — orchestrates emergency check → context → AI → filter → store.

Implements the 8-step chat pipeline from the plan:
  1. Emergency keyword check (bypass AI if triggered)
  2. Load last 10 messages from session
  3. Build summarized health context (~800 tokens)
  4. PII scrub context
  5. Call HealthAIService.chat_response()
  6. Post-filter (strip diagnoses) + disclaimer
  7. Store user message + assistant response in chat_messages
  8. Return {answer, disclaimer} or {emergency, message, hotlines, disclaimer}

Rate limit: 20 messages per user per day (DB count, swappable to Redis).
"""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.models import (
    ChatMessage,
    ChatSession,
    UserBaseline,
    WeeklyDebrief,
)
from app.services.ai.factory import get_ai_service
from app.services.debrief_service import current_week_bounds
from app.services.metrics_engine import compute_weekly_summary
from app.services.pii_scrubber import scrub_chat_context
from app.services.safety_guardrails import (
    DISCLAIMER,
    EmergencyResult,
    emergency_check,
    post_filter,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_RATE_LIMIT_PER_DAY: int = 20
_HISTORY_LIMIT: int = 10

# Static chat system prompt — persona + constraints
_CHAT_SYSTEM_PROMPT = """\
You are a health data analyst with a warm but scientific tone. You answer \
questions about the user's health data specifically.

RULES:
- Never diagnose medical conditions.
- Recommend consulting a healthcare professional for medical concerns.
- Keep responses conversational and concise.
- Reference the user's actual numbers when available.
- Do not speculate about conditions or prescribe treatments.\
"""


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------

def _check_rate_limit(db: Session, user_id: uuid.UUID) -> int:
    """Return the number of messages remaining today.

    Raises ``RateLimitExceeded`` if the user has hit the daily cap.
    """
    today_start = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0,
    )
    count = (
        db.query(func.count(ChatMessage.id))
        .filter(
            ChatMessage.user_id == user_id,
            ChatMessage.role == "user",
            ChatMessage.created_at >= today_start,
        )
        .scalar()
    ) or 0

    remaining = max(0, _RATE_LIMIT_PER_DAY - count)
    if remaining == 0:
        raise RateLimitExceeded(
            f"Daily message limit ({_RATE_LIMIT_PER_DAY}) reached. "
            "Try again tomorrow."
        )
    return remaining


class RateLimitExceeded(Exception):
    """Raised when the user exceeds the daily chat message limit."""
    pass


# ---------------------------------------------------------------------------
# Context builder
# ---------------------------------------------------------------------------

def _build_health_context(
    db: Session,
    user_id: uuid.UUID,
) -> dict[str, Any]:
    """Assemble summarized health context for the chat system prompt.

    Includes:
      - This week's composite scores + per-metric deltas
      - Current baselines with z-scores
      - Most recent debrief narrative (truncated)

    Returns a dict that will be PII-scrubbed before sending to the AI.
    """
    context: dict[str, Any] = {}

    # Current week engine output
    try:
        week_start, week_end = current_week_bounds()
        summary = compute_weekly_summary(db, user_id, week_start, week_end)
        context["composite_scores"] = summary.get("composite_scores")
        context["per_metric"] = summary.get("per_metric")
    except Exception:
        logger.debug("Could not compute weekly summary for chat context")

    # Baselines
    baselines = (
        db.query(UserBaseline)
        .filter(UserBaseline.user_id == user_id)
        .all()
    )
    if baselines:
        context["baselines"] = [
            {
                "metric_type": b.metric_type,
                "baseline_value": round(b.baseline_value, 2),
                "std_deviation": round(b.std_deviation, 2),
            }
            for b in baselines
        ]

    # Latest debrief narrative
    latest_debrief = (
        db.query(WeeklyDebrief)
        .filter(
            WeeklyDebrief.user_id == user_id,
            WeeklyDebrief.status.in_(["generated", "sent"]),
        )
        .order_by(WeeklyDebrief.week_start.desc())
        .first()
    )
    if latest_debrief and latest_debrief.narrative:
        context["narrative"] = latest_debrief.narrative

    return context


# ---------------------------------------------------------------------------
# Session helpers
# ---------------------------------------------------------------------------

def create_session(
    db: Session,
    user_id: uuid.UUID,
    title: str | None = None,
) -> ChatSession:
    """Create a new chat session."""
    session = ChatSession(user_id=user_id, title=title)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def list_sessions(
    db: Session,
    user_id: uuid.UUID,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[ChatSession], int]:
    """Paginated list of chat sessions, newest first."""
    query = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == user_id)
        .order_by(ChatSession.created_at.desc())
    )
    total = query.count()
    items = query.offset(offset).limit(limit).all()
    return items, total


def list_messages(
    db: Session,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[ChatMessage], int]:
    """Paginated messages in a session (ownership-verified)."""
    # Verify ownership
    session = (
        db.query(ChatSession)
        .filter(
            ChatSession.id == session_id,
            ChatSession.user_id == user_id,
        )
        .first()
    )
    if session is None:
        raise SessionNotFound("Chat session not found")

    query = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())
    )
    total = query.count()
    items = query.offset(offset).limit(limit).all()
    return items, total


class SessionNotFound(Exception):
    """Raised when a chat session does not exist or is not owned by the user."""
    pass


# ---------------------------------------------------------------------------
# Main chat pipeline
# ---------------------------------------------------------------------------

async def send_message(
    db: Session,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    user_content: str,
) -> dict[str, Any]:
    """Run the full chat pipeline for a single user message.

    Returns a dict with either:
      - ``{"answer", "disclaimer", "user_msg", "assistant_msg"}``
      - ``{"emergency", "message", "hotlines", "disclaimer", "user_msg", "assistant_msg"}``
    """
    # Verify session ownership
    session = (
        db.query(ChatSession)
        .filter(
            ChatSession.id == session_id,
            ChatSession.user_id == user_id,
        )
        .first()
    )
    if session is None:
        raise SessionNotFound("Chat session not found")

    # Rate limit
    _check_rate_limit(db, user_id)

    # Step 1: Emergency check
    emergency = emergency_check(user_content)
    if emergency is not None:
        return await _handle_emergency(db, user_id, session, user_content, emergency)

    # Step 2: Load recent history
    recent = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(_HISTORY_LIMIT)
        .all()
    )
    # Reverse to chronological order
    recent.reverse()
    history = [{"role": m.role, "content": m.content} for m in recent]

    # Step 3: Build health context
    context = _build_health_context(db, user_id)

    # Step 4: PII scrub
    clean_context = scrub_chat_context(context)

    # Build the system prompt with health context
    context_str = _format_context(clean_context)
    full_system = f"{_CHAT_SYSTEM_PROMPT}\n\nUSER HEALTH CONTEXT:\n{context_str}"

    # Step 5: AI call
    ai = get_ai_service()
    ai_result = await ai.chat_response(
        system_prompt=full_system,
        messages=history,
        user_message=user_content,
    )

    # Step 6: Post-filter
    filtered_answer = post_filter(ai_result.answer)

    # Step 7: Store messages
    user_msg = ChatMessage(
        session_id=session_id,
        user_id=user_id,
        role="user",
        content=user_content,
    )
    assistant_msg = ChatMessage(
        session_id=session_id,
        user_id=user_id,
        role="assistant",
        content=filtered_answer,
    )
    db.add(user_msg)
    db.add(assistant_msg)

    # Auto-title: set session title from first message if not set
    if session.title is None:
        session.title = user_content[:50]

    db.commit()
    db.refresh(user_msg)
    db.refresh(assistant_msg)

    # Step 8: Return response
    return {
        "answer": filtered_answer,
        "disclaimer": DISCLAIMER,
        "user_msg": user_msg,
        "assistant_msg": assistant_msg,
    }


async def _handle_emergency(
    db: Session,
    user_id: uuid.UUID,
    session: ChatSession,
    user_content: str,
    emergency: EmergencyResult,
) -> dict[str, Any]:
    """Store the user message + emergency response and return."""
    user_msg = ChatMessage(
        session_id=session.id,
        user_id=user_id,
        role="user",
        content=user_content,
    )
    assistant_msg = ChatMessage(
        session_id=session.id,
        user_id=user_id,
        role="assistant",
        content=emergency.message,
    )
    db.add(user_msg)
    db.add(assistant_msg)

    if session.title is None:
        session.title = user_content[:50]

    db.commit()
    db.refresh(user_msg)
    db.refresh(assistant_msg)

    return {
        "emergency": True,
        "message": emergency.message,
        "hotlines": emergency.hotlines,
        "disclaimer": emergency.disclaimer,
        "user_msg": user_msg,
        "assistant_msg": assistant_msg,
    }


def _format_context(context: dict[str, Any]) -> str:
    """Format the health context dict into a compact string for the system prompt."""
    parts: list[str] = []

    scores = context.get("composite_scores")
    if scores:
        parts.append(
            f"Composite scores — Recovery: {scores.get('recovery')}, "
            f"Sleep: {scores.get('sleep')}, Activity: {scores.get('activity')}"
        )

    metrics = context.get("per_metric")
    if metrics:
        for m in metrics:
            line = (
                f"{m['type']}: avg={m.get('current_avg')}, "
                f"baseline={m.get('baseline')}, "
                f"delta={m.get('delta_pct_vs_baseline')}%, "
                f"trend={m.get('trend')}"
            )
            parts.append(line)

    baselines = context.get("baselines")
    if baselines:
        bl_lines = [
            f"{b['metric_type']}: {b['baseline_value']} ± {b['std_deviation']}"
            for b in baselines
        ]
        parts.append("Baselines: " + "; ".join(bl_lines))

    narrative = context.get("narrative")
    if narrative:
        parts.append(f"Latest debrief: {narrative}")

    return "\n".join(parts) if parts else "No health context available yet."
