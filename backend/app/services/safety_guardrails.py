"""Safety guardrails — emergency filter, post-LLM diagnosis stripper, disclaimer.

Three responsibilities:

1. **Pre-LLM emergency filter** (``emergency_check``):
   Scans the user's chat message for emergency/crisis terms *before* it
   reaches the AI.  If triggered, the caller must bypass the LLM and return
   a hardcoded emergency response.  Deterministic, zero latency.

2. **Post-LLM diagnosis stripper** (``post_filter``):
   Scans every AI response (debrief or chat) and removes sentences that
   contain medical diagnoses, treatment plans, or medication instructions.
   Uses pattern matching + a curated blocked-phrases list — no AI call.

3. **Mandatory disclaimer** (``DISCLAIMER``):
   A constant string appended server-side to every AI-generated response.
   Non-negotiable, cannot be prompt-injected away.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Disclaimer — appended to every AI response, server-side
# ---------------------------------------------------------------------------

DISCLAIMER: str = (
    "This is not medical advice. "
    "Consult a healthcare professional for medical concerns."
)

# ---------------------------------------------------------------------------
# 1. Pre-LLM Emergency Filter
# ---------------------------------------------------------------------------

# Phrases that indicate a medical/mental-health emergency.
# Checked via case-insensitive substring matching.
_EMERGENCY_PHRASES: list[str] = [
    "chest pain",
    "can't breathe",
    "cannot breathe",
    "difficulty breathing",
    "trouble breathing",
    "suicidal",
    "suicide",
    "kill myself",
    "want to die",
    "end my life",
    "heart attack",
    "overdose",
    "seizure",
    "unconscious",
    "stroke symptoms",
    "having a stroke",
    "severe bleeding",
    "anaphylaxis",
    "allergic reaction",
    "choking",
    "not breathing",
    "stopped breathing",
    "self-harm",
    "self harm",
    "harming myself",
]

# Compiled regex: match any of the phrases (word-boundary aware where practical)
_EMERGENCY_RE = re.compile(
    "|".join(re.escape(p) for p in _EMERGENCY_PHRASES),
    re.IGNORECASE,
)

_EMERGENCY_MESSAGE: str = (
    "It sounds like you or someone nearby may be experiencing a medical or "
    "mental-health emergency. Please take the following steps immediately:\n\n"
    "• **Call 911** (or your local emergency number) right away.\n"
    "• If you're having thoughts of suicide or self-harm, contact the "
    "**988 Suicide & Crisis Lifeline** by calling or texting **988**.\n"
    "• **Crisis Text Line:** Text HOME to **741741**.\n"
    "• Stay with someone you trust until help arrives.\n\n"
    "I'm an AI wellness assistant and am not equipped to handle emergencies. "
    "A trained professional can help you right now."
)

_HOTLINES: list[dict[str, str]] = [
    {"name": "Emergency Services", "number": "911"},
    {"name": "988 Suicide & Crisis Lifeline", "number": "988"},
    {"name": "Crisis Text Line", "number": "Text HOME to 741741"},
    {"name": "SAMHSA National Helpline", "number": "1-800-662-4357"},
    {"name": "Poison Control", "number": "1-800-222-1222"},
]


@dataclass(frozen=True, slots=True)
class EmergencyResult:
    """Returned by ``emergency_check`` when an emergency phrase is detected."""

    triggered: bool
    message: str
    hotlines: list[dict[str, str]]
    disclaimer: str


def emergency_check(user_message: str) -> EmergencyResult | None:
    """Scan *user_message* for emergency/crisis keywords.

    Returns an ``EmergencyResult`` if triggered, else ``None``.
    The caller should bypass the LLM and return this response directly.
    """
    if _EMERGENCY_RE.search(user_message):
        logger.warning("Emergency keyword detected — bypassing AI")
        return EmergencyResult(
            triggered=True,
            message=_EMERGENCY_MESSAGE,
            hotlines=_HOTLINES,
            disclaimer=DISCLAIMER,
        )
    return None


# ---------------------------------------------------------------------------
# 2. Post-LLM Diagnosis Stripper
# ---------------------------------------------------------------------------

# Patterns that indicate a medical diagnosis, treatment plan, or medication
# instruction.  Each regex is applied per-sentence.

_DIAGNOSIS_PATTERNS: list[re.Pattern[str]] = [
    # "you have <condition>"
    re.compile(r"\byou\s+have\s+(?:a\s+)?(?:been\s+)?(?:diagnosed\s+with\s+)?\w[\w\s]{2,30}(?:disease|disorder|syndrome|condition|infection|deficiency)", re.IGNORECASE),
    # "this indicates <disease>"
    re.compile(r"\bthis\s+(?:indicates|suggests|means\s+you\s+have|is\s+a\s+sign\s+of)\s+\w", re.IGNORECASE),
    # "you should take <medication>"
    re.compile(r"\byou\s+should\s+(?:take|start|begin|stop|increase|decrease)\s+\w+\s*(?:mg|mcg|ml|tablet|capsule|pill|dose)?", re.IGNORECASE),
    # "start <treatment>"
    re.compile(r"\bstart\s+(?:taking|using)\s+\w", re.IGNORECASE),
    # Direct medication references
    re.compile(r"\b(?:prescribe|prescription|medication|dosage|milligrams?\b)", re.IGNORECASE),
    # "I diagnose" / "my diagnosis"
    re.compile(r"\b(?:I\s+diagnose|my\s+diagnosis)", re.IGNORECASE),
]

# Curated blocked phrases (exact substring, case-insensitive)
_BLOCKED_PHRASES: list[str] = [
    "you are suffering from",
    "you are diagnosed with",
    "your diagnosis is",
    "i recommend you take",
    "take this medication",
    "stop taking your medication",
    "increase your dosage",
    "decrease your dosage",
    "you need to be on",
    "you should be prescribed",
]

_BLOCKED_RE = re.compile(
    "|".join(re.escape(p) for p in _BLOCKED_PHRASES),
    re.IGNORECASE,
)

_REPLACEMENT = (
    "For specific medical concerns, please consult a healthcare professional."
)

# Sentence splitter — split on ., !, ? followed by whitespace or end
_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")


def _is_flagged(sentence: str) -> bool:
    """Return True if the sentence matches any diagnosis/treatment pattern."""
    if _BLOCKED_RE.search(sentence):
        return True
    return any(p.search(sentence) for p in _DIAGNOSIS_PATTERNS)


def post_filter(ai_text: str) -> str:
    """Strip sentences containing diagnoses, treatment plans, or medication
    instructions from *ai_text*.

    Flagged sentences are replaced with a redirect to a healthcare
    professional.  A single replacement sentence is inserted regardless of
    how many sentences were stripped (to avoid repetition).

    Returns the filtered text.
    """
    sentences = _SENTENCE_RE.split(ai_text)
    filtered: list[str] = []
    replaced = False

    for sentence in sentences:
        if _is_flagged(sentence):
            logger.info("Post-filter stripped sentence: %s", sentence[:80])
            if not replaced:
                filtered.append(_REPLACEMENT)
                replaced = True
            # Skip the flagged sentence
        else:
            filtered.append(sentence)

    return " ".join(filtered)


# ---------------------------------------------------------------------------
# 3. Convenience: apply post-filter + disclaimer to an AI response
# ---------------------------------------------------------------------------

def apply_guardrails(ai_text: str) -> dict[str, str]:
    """Run the post-LLM filter and attach the mandatory disclaimer.

    Returns ``{"text": <filtered>, "disclaimer": <disclaimer>}``.
    """
    filtered = post_filter(ai_text)
    return {
        "text": filtered,
        "disclaimer": DISCLAIMER,
    }
