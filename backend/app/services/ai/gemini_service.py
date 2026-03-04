"""Vertex AI (Gemini Flash) implementation of HealthAIService.

Uses the ``google-cloud-aiplatform`` SDK to call Gemini models through
Vertex AI — *not* the consumer Gemini API — because Vertex AI is covered
under Google Cloud's BAA, which is required for HIPAA compliance when
processing health data.

Configuration is read from ``core/config.py``:
  - GCP_PROJECT_ID
  - GCP_LOCATION  (default ``us-central1``)
  - AI_MODEL      (default ``gemini-2.0-flash``)
"""

from __future__ import annotations

import json
import logging
from typing import Any

from google.cloud import aiplatform
from vertexai.generative_models import (
    GenerationConfig,
    GenerativeModel,
    Content,
    Part,
)
import vertexai

from app.core.config import get_settings
from app.services.ai.base import ChatResult, DebriefResult, HealthAIService

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Prompts — static parts live here so they are cacheable at the provider level
# ---------------------------------------------------------------------------

DEBRIEF_SYSTEM_PROMPT = """\
You are a health data analyst with a warm but scientific tone. Your job is to \
write a weekly health narrative for the user based on precomputed metrics \
summaries. You never see raw data — only statistical summaries.

OUTPUT FORMAT — you MUST respond with a valid JSON object and nothing else:
{
  "narrative": "<3–4 paragraph health narrative as a single string>",
  "highlights": [
    {"label": "<metric name>", "value": "<formatted value>", "delta_vs_baseline": "<signed percent string>"}
  ]
}

RULES:
- Never diagnose medical conditions.
- If concerning patterns are present, recommend consulting a healthcare professional.
- Reference the user's actual numbers from the summary.
- Prioritize what changed or what stands out compared to baseline.
- End with 1–2 concrete, actionable suggestions.
- Keep the narrative between 150 and 400 words.
- The highlights array should have one entry per metric provided.\
"""

CHAT_SYSTEM_BASE = """\
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
# Implementation
# ---------------------------------------------------------------------------

class GeminiHealthAIService(HealthAIService):
    """Gemini Flash via Vertex AI.

    Lazily initialises the Vertex AI SDK and model on first use so that
    import-time side-effects are avoided (important for tests and factory
    loading).
    """

    def __init__(self) -> None:
        self._model: GenerativeModel | None = None
        self._initialised: bool = False

    # -- lazy init ----------------------------------------------------------

    def _ensure_init(self) -> GenerativeModel:
        """Initialise Vertex AI SDK + model on first call."""
        if self._model is not None:
            return self._model

        settings = get_settings()

        if not self._initialised:
            vertexai.init(
                project=settings.GCP_PROJECT_ID,
                location=settings.GCP_LOCATION,
            )
            self._initialised = True

        self._model = GenerativeModel(settings.AI_MODEL)
        return self._model

    # -- debrief ------------------------------------------------------------

    async def generate_debrief(self, summary: dict) -> DebriefResult:
        """Send the precomputed metrics summary to Gemini and parse the
        structured JSON response into a ``DebriefResult``."""

        model = self._ensure_init()

        user_prompt = (
            "Here is the user's weekly health metrics summary. "
            "Generate the debrief narrative and highlights.\n\n"
            f"```json\n{json.dumps(summary, default=str)}\n```"
        )

        generation_config = GenerationConfig(
            temperature=0.3,
            max_output_tokens=1024,
            response_mime_type="application/json",
        )

        response = await model.generate_content_async(
            contents=[
                Content(role="user", parts=[Part.from_text(user_prompt)]),
            ],
            generation_config=generation_config,
            system_instruction=DEBRIEF_SYSTEM_PROMPT,
        )

        return self._parse_debrief_response(response)

    # -- chat ---------------------------------------------------------------

    async def chat_response(
        self,
        system_prompt: str,
        messages: list[dict],
        user_message: str,
    ) -> ChatResult:
        """Build a Gemini multi-turn conversation and return the reply."""

        model = self._ensure_init()

        # Combine the base chat persona with any caller-provided context
        full_system = f"{CHAT_SYSTEM_BASE}\n\n{system_prompt}"

        # Build Vertex AI Content list from conversation history
        contents: list[Content] = []
        for msg in messages:
            role = "user" if msg["role"] == "user" else "model"
            contents.append(
                Content(role=role, parts=[Part.from_text(msg["content"])])
            )

        # Append the new user message
        contents.append(
            Content(role="user", parts=[Part.from_text(user_message)])
        )

        generation_config = GenerationConfig(
            temperature=0.5,
            max_output_tokens=512,
        )

        response = await model.generate_content_async(
            contents=contents,
            generation_config=generation_config,
            system_instruction=full_system,
        )

        answer = response.text.strip()
        return ChatResult(answer=answer)

    # -- response parsing ---------------------------------------------------

    @staticmethod
    def _parse_debrief_response(response: Any) -> DebriefResult:
        """Extract ``narrative`` and ``highlights`` from the Gemini JSON
        response, with defensive fallbacks."""

        raw_text = response.text.strip()

        try:
            data = json.loads(raw_text)
        except json.JSONDecodeError:
            # Gemini occasionally wraps JSON in markdown fences
            cleaned = raw_text
            if cleaned.startswith("```"):
                # Strip ```json ... ``` wrapper
                first_newline = cleaned.index("\n")
                cleaned = cleaned[first_newline + 1:]
                if cleaned.endswith("```"):
                    cleaned = cleaned[:-3]
                cleaned = cleaned.strip()
            try:
                data = json.loads(cleaned)
            except json.JSONDecodeError as exc:
                logger.error(
                    "Failed to parse Gemini debrief response as JSON: %s",
                    raw_text[:500],
                )
                raise ValueError(
                    "AI provider returned unparseable debrief response"
                ) from exc

        narrative = data.get("narrative", "")
        highlights = data.get("highlights", [])

        if not isinstance(narrative, str) or not narrative:
            raise ValueError("AI response missing 'narrative' field")
        if not isinstance(highlights, list):
            highlights = []

        return DebriefResult(narrative=narrative, highlights=highlights)
