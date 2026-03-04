"""Notification service — Resend email delivery for weekly debriefs.

Sends an HTML email with:
  - 2–3 sentence summary extracted from the debrief narrative
  - Link to the full debrief in the app
  - Medical disclaimer
  - Unsubscribe link (points to app settings)

Uses the Jinja2 template at ``templates/debrief_email.html``.
"""

from __future__ import annotations

import logging
from pathlib import Path

import resend
from jinja2 import Environment, FileSystemLoader

from app.core.config import get_settings
from app.models.models import User, WeeklyDebrief
from app.services.safety_guardrails import DISCLAIMER

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Template setup
# ---------------------------------------------------------------------------

_TEMPLATE_DIR = Path(__file__).resolve().parent.parent.parent / "templates"
_jinja_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATE_DIR)),
    autoescape=True,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_summary(narrative: str, max_sentences: int = 3) -> str:
    """Pull the first *max_sentences* sentences from the narrative for the
    email preview."""
    import re
    sentences = re.split(r"(?<=[.!?])\s+", narrative)
    return " ".join(sentences[:max_sentences])


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def send_debrief_email(
    user: User,
    debrief: WeeklyDebrief,
) -> None:
    """Send the weekly debrief email via Resend.

    Args:
        user: The recipient user (need email + notification prefs).
        debrief: The generated debrief with narrative + highlights.

    Raises:
        Exception: On Resend API errors (caller decides how to handle).
    """
    settings = get_settings()

    # Respect notification preferences
    if not user.email_notifications_enabled:
        logger.info("Email notifications disabled for user %s — skipping", user.id)
        return

    recipient = user.notification_email or user.email
    if not recipient:
        logger.warning("No email address for user %s — skipping", user.id)
        return

    # Build template context
    summary_text = _extract_summary(debrief.narrative or "")
    frontend_url = settings.FRONTEND_URL.rstrip("/")
    debrief_url = f"{frontend_url}/"
    settings_url = f"{frontend_url}/settings"

    template = _jinja_env.get_template("debrief_email.html")
    html_body = template.render(
        user_name=user.name or "there",
        week_start=debrief.week_start.strftime("%B %d"),
        week_end=debrief.week_end.strftime("%B %d, %Y"),
        summary=summary_text,
        highlights=debrief.highlights or [],
        debrief_url=debrief_url,
        settings_url=settings_url,
        disclaimer=DISCLAIMER,
    )

    # Send via Resend
    resend.api_key = settings.RESEND_API_KEY

    params: resend.Emails.SendParams = {
        "from": "VitalView <noreply@vitalview.app>",
        "to": [recipient],
        "subject": f"Your Weekly Health Debrief — {debrief.week_start.strftime('%b %d')} to {debrief.week_end.strftime('%b %d')}",
        "html": html_body,
    }

    response = resend.Emails.send(params)
    logger.info(
        "Debrief email sent for user %s, debrief %s — Resend ID: %s",
        user.id, debrief.id, response.get("id", "unknown"),
    )
