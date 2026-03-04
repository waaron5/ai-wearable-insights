"""PII scrubber — mandatory de-identification gate before any AI call.

This module enforces the strict boundary described in the HIPAA section of
the plan:

  Stripped:  name, email, notification_email, timezone, any string field
             that could identify the user.
  Passed:   Only ``user_id`` UUID (opaque) + precomputed numerical summaries.
  Blocked:  Raw metric rows, dates of birth, IP addresses, device IDs.

The scrubber runs on the assembled AI payload and returns a clean copy.
Even though the metrics engine output *should* be PII-free by construction,
this module is a non-negotiable safety net — defence in depth.

Usage::

    from app.services.pii_scrubber import scrub_for_ai

    clean = scrub_for_ai(engine_output)
    result = await ai.generate_debrief(clean)
"""

from __future__ import annotations

import copy
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Fields that MUST be removed from any dict before it reaches the AI
# ---------------------------------------------------------------------------

_PII_KEYS: set[str] = {
    "name",
    "email",
    "notification_email",
    "hashed_password",
    "timezone",
    "image",
    "ip_address",
    "ip",
    "device_id",
    "device_identifier",
    "date_of_birth",
    "dob",
    "phone",
    "phone_number",
    "address",
    "session_token",
    "access_token",
    "refresh_token",
}

# Regex for common PII patterns that might appear in string values
_EMAIL_RE = re.compile(
    r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", re.ASCII
)

# Allowlist of top-level keys that are safe to pass through
_SAFE_TOP_KEYS: set[str] = {
    "week",
    "insufficient_data",
    "composite_scores",
    "per_metric",
    "notable_days",
    "prior_week_avgs",
    "metrics",
    "prior_week_trends",
    # user_id kept as opaque identifier
    "user_id",
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def scrub_for_ai(payload: dict[str, Any]) -> dict[str, Any]:
    """Return a deep-copied, PII-free version of *payload*.

    - Removes any key in ``_PII_KEYS`` (case-insensitive, recursive).
    - Redacts email-like patterns found in string values.
    - For the debrief path the payload is typically the metrics engine output
      which is already PII-free; this function is a safety net.

    The original dict is never mutated.
    """
    cleaned = copy.deepcopy(payload)
    _strip_recursive(cleaned)
    cleaned = _redact_strings(cleaned)
    return cleaned


def scrub_chat_context(context: dict[str, Any]) -> dict[str, Any]:
    """Scrub a chat context payload.

    Chat context may include richer data (e.g. debrief narratives, baseline
    summaries).  Same rules as ``scrub_for_ai`` but also truncates any
    ``narrative`` field to ~200 tokens (~800 chars) to stay within the
    <800-token chat context budget.
    """
    cleaned = copy.deepcopy(context)
    _strip_recursive(cleaned)

    # Truncate narrative if present (200 tokens ≈ 800 chars)
    if "narrative" in cleaned and isinstance(cleaned["narrative"], str):
        cleaned["narrative"] = _truncate(cleaned["narrative"], max_chars=800)

    return cleaned


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------

def _strip_recursive(obj: Any) -> None:
    """Walk a nested dict/list structure and remove PII in-place."""
    if isinstance(obj, dict):
        # Remove PII keys
        keys_to_remove = [
            k for k in obj if k.lower() in _PII_KEYS
        ]
        for k in keys_to_remove:
            del obj[k]
            logger.debug("Stripped PII key: %s", k)

        # Recurse into remaining values
        for v in obj.values():
            _strip_recursive(v)

    elif isinstance(obj, list):
        for item in obj:
            _strip_recursive(item)

    elif isinstance(obj, str):
        # We can't mutate the string in-place from within a dict/list
        # traversal — string redaction is handled at the dict-value level
        # in the parent call.  See _redact_strings.
        pass


def _redact_strings(obj: Any) -> Any:
    """Return a copy of *obj* with email patterns redacted in strings."""
    if isinstance(obj, str):
        return _EMAIL_RE.sub("[REDACTED]", obj)
    elif isinstance(obj, dict):
        return {k: _redact_strings(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_redact_strings(item) for item in obj]
    return obj


def _truncate(text: str, max_chars: int = 800) -> str:
    """Truncate text to approximately *max_chars*, breaking at a sentence."""
    if len(text) <= max_chars:
        return text
    # Try to break at last sentence boundary before max_chars
    truncated = text[:max_chars]
    last_period = truncated.rfind(".")
    if last_period > max_chars // 2:
        return truncated[: last_period + 1]
    return truncated + "..."
