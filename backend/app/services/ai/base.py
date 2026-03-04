"""Abstract base class for all AI service providers.

Every AI provider (Vertex AI / Gemini, Claude, GPT-4o, etc.) implements this
interface.  Business logic (debrief_service, chat_service) programs against
HealthAIService — never against a concrete provider — so swapping providers
requires zero changes outside the ``services/ai/`` package.

The interface enforces two capabilities:
  1. generate_debrief  — turn a precomputed metrics summary into a narrative
  2. chat_response     — answer a user question given health-context + history
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass


# ---------------------------------------------------------------------------
# Response containers – concrete, provider-agnostic
# ---------------------------------------------------------------------------

@dataclass(frozen=True, slots=True)
class DebriefResult:
    """Value object returned by ``generate_debrief``.

    Attributes:
        narrative: 3–4 paragraph AI-generated health narrative.
        highlights: List of dicts, each with ``label``, ``value``,
            ``delta_vs_baseline`` keys — e.g.
            ``{"label": "Avg Sleep", "value": "6.8 hrs", "delta_vs_baseline": "-8%"}``.
    """

    narrative: str
    highlights: list[dict]


@dataclass(frozen=True, slots=True)
class ChatResult:
    """Value object returned by ``chat_response``.

    Attributes:
        answer: The assistant's reply text.
    """

    answer: str


# ---------------------------------------------------------------------------
# Abstract interface
# ---------------------------------------------------------------------------

class HealthAIService(ABC):
    """Interface that every AI provider must implement.

    All AI calls in the application flow through this contract:
      - The **debrief pipeline** calls ``generate_debrief`` with a compact,
        PII-scrubbed JSON summary produced by ``metrics_engine.py``.
      - The **chat pipeline** calls ``chat_response`` with a static system
        prompt, conversation history, and the user's new message.

    Implementors are responsible for:
      - Constructing the provider-specific prompt from the inputs.
      - Parsing the provider's raw response into the typed result objects.
      - Raising clear errors on API/parsing failures (callers handle retries).

    Implementors must NOT:
      - Apply safety guardrails — that is handled by ``safety_guardrails.py``.
      - Scrub PII — that is handled by ``pii_scrubber.py`` before this layer.
      - Persist anything — callers decide what to store.
    """

    # -- Debrief generation -------------------------------------------------

    @abstractmethod
    async def generate_debrief(self, summary: dict) -> DebriefResult:
        """Generate a weekly health narrative from a precomputed summary.

        Args:
            summary: The compact JSON dict produced by ``metrics_engine.py``
                and scrubbed by ``pii_scrubber.py``.  Structure includes
                ``composite_scores``, ``per_metric``, ``notable_days``,
                ``prior_week_avgs``, etc. — always <800 tokens.

        Returns:
            A ``DebriefResult`` containing the narrative and highlights.

        Raises:
            Exception: On provider API errors or response-parsing failures.
        """
        ...

    # -- Chat ---------------------------------------------------------------

    @abstractmethod
    async def chat_response(
        self,
        system_prompt: str,
        messages: list[dict],
        user_message: str,
    ) -> ChatResult:
        """Generate a single chat reply.

        Args:
            system_prompt: Static persona / constraint prompt (cacheable).
            messages: Prior conversation turns as
                ``[{"role": "user"|"assistant", "content": "..."}]``.
            user_message: The new message from the user.

        Returns:
            A ``ChatResult`` containing the assistant's reply.

        Raises:
            Exception: On provider API errors or response-parsing failures.
        """
        ...
