"""Deterministic metrics engine — all math, no AI.

This is the central data processing pipeline.  It reads raw DB rows,
aggregates them, handles gaps, computes z-scores / composite scores /
trends / notable days, and outputs a structured summary dict consumed by:

  1. ``GET /debriefs/weekly-summary`` (returned directly, no AI)
  2. ``pii_scrubber → HealthAIService.generate_debrief()``
  3. Chat context builder

The engine **never** calls an LLM.  All calculations are deterministic
Python so results are reproducible and testable.
"""

from __future__ import annotations

import logging
import uuid
from datetime import date, timedelta
from statistics import mean, pstdev
from typing import Any

from sqlalchemy.orm import Session

from app.models.models import HealthMetric, UserBaseline

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

METRIC_TYPES: list[str] = ["sleep_hours", "hrv", "resting_hr", "steps"]

# Metrics where *lower* is better (inverted polarity for trend classification)
_LOWER_IS_BETTER: set[str] = {"resting_hr"}

# Trend thresholds
_TREND_THRESHOLD_PCT: float = 5.0  # >5% change = improving/declining

# Composite score weights
_RECOVERY_WEIGHTS: dict[str, float] = {"hrv": 0.40, "resting_hr": 0.30, "sleep_hours": 0.30}

# Notable day z-score threshold
_NOTABLE_Z_THRESHOLD: float = 2.0
_MAX_NOTABLE_DAYS: int = 5


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))


def _safe_z(value: float, baseline: float, std: float) -> float:
    """Z-score with safe division."""
    if std == 0 or std is None:
        return 0.0
    return (value - baseline) / std


def _safe_pct_change(current: float, reference: float) -> float | None:
    """Percent change, guarded against division by zero."""
    if reference == 0:
        return None
    return round(((current - reference) / reference) * 100, 1)


def _classify_trend(
    delta_pct: float | None,
    metric_type: str,
) -> str:
    """Return ``'improving'``, ``'declining'``, or ``'stable'``."""
    if delta_pct is None:
        return "stable"

    magnitude = abs(delta_pct)
    if magnitude <= _TREND_THRESHOLD_PCT:
        return "stable"

    # For resting_hr, a negative delta (lower value) is improving
    inverted = metric_type in _LOWER_IS_BETTER
    going_down = delta_pct < 0

    if inverted:
        return "improving" if going_down else "declining"
    else:
        return "improving" if not going_down else "declining"


# ---------------------------------------------------------------------------
# Step 1 — Read & validate raw data
# ---------------------------------------------------------------------------

def _fetch_metrics(
    db: Session,
    user_id: uuid.UUID,
    start: date,
    end: date,
) -> list[HealthMetric]:
    """Query health_metrics rows for a user in a date range (inclusive)."""
    return (
        db.query(HealthMetric)
        .filter(
            HealthMetric.user_id == user_id,
            HealthMetric.date >= start,
            HealthMetric.date <= end,
        )
        .all()
    )


def _fetch_baselines(
    db: Session,
    user_id: uuid.UUID,
) -> dict[str, UserBaseline]:
    """Return {metric_type: UserBaseline} for the user."""
    rows = (
        db.query(UserBaseline)
        .filter(UserBaseline.user_id == user_id)
        .all()
    )
    return {r.metric_type: r for r in rows}


# ---------------------------------------------------------------------------
# Step 2 — Daily aggregation & gap handling
# ---------------------------------------------------------------------------

def _build_daily_matrix(
    metrics: list[HealthMetric],
    week_start: date,
    week_end: date,
) -> dict[date, dict[str, float | None]]:
    """Build a 7-day matrix {date → {metric_type → value}}.

    Missing days/metrics are ``None``.
    """
    matrix: dict[date, dict[str, float | None]] = {}
    day = week_start
    while day <= week_end:
        matrix[day] = {mt: None for mt in METRIC_TYPES}
        day += timedelta(days=1)

    for m in metrics:
        if m.date in matrix and m.metric_type in matrix[m.date]:
            matrix[m.date][m.metric_type] = m.value

    return matrix


def _per_metric_aggregates(
    matrix: dict[date, dict[str, float | None]],
) -> dict[str, dict[str, Any]]:
    """Compute per-metric stats from the daily matrix.

    Returns ``{metric_type: {current_avg, current_min, current_max, days_with_data, values}}``
    where ``values`` is the list of non-null daily values (used later for
    std deviation in sleep scoring).
    """
    result: dict[str, dict[str, Any]] = {}

    for mt in METRIC_TYPES:
        values = [row[mt] for row in matrix.values() if row[mt] is not None]
        if values:
            result[mt] = {
                "current_avg": round(mean(values), 2),
                "current_min": round(min(values), 2),
                "current_max": round(max(values), 2),
                "days_with_data": len(values),
                "values": values,
            }
        else:
            result[mt] = {
                "current_avg": None,
                "current_min": None,
                "current_max": None,
                "days_with_data": 0,
                "values": [],
            }

    return result


# ---------------------------------------------------------------------------
# Step 3 — Statistical analysis
# ---------------------------------------------------------------------------

def _compute_daily_z_scores(
    matrix: dict[date, dict[str, float | None]],
    baselines: dict[str, UserBaseline],
) -> dict[date, dict[str, float | None]]:
    """Per-day, per-metric z-scores."""
    z_matrix: dict[date, dict[str, float | None]] = {}
    for day, metrics in matrix.items():
        z_matrix[day] = {}
        for mt in METRIC_TYPES:
            val = metrics[mt]
            bl = baselines.get(mt)
            if val is not None and bl is not None:
                z_matrix[day][mt] = round(
                    _safe_z(val, bl.baseline_value, bl.std_deviation), 2
                )
            else:
                z_matrix[day][mt] = None
    return z_matrix


def _prior_week_avgs(metrics: list[HealthMetric]) -> dict[str, float | None]:
    """Compute average per metric from the prior week's rows."""
    by_type: dict[str, list[float]] = {}
    for m in metrics:
        by_type.setdefault(m.metric_type, []).append(m.value)
    return {
        mt: round(mean(vals), 2) if vals else None
        for mt, vals in by_type.items()
    }


# ---------------------------------------------------------------------------
# Step 4 — Composite scoring
# ---------------------------------------------------------------------------

def _z_to_score(z: float) -> float:
    """Map a z-score to a 0-100 scale: ``clamp(50 + z * 15, 0, 100)``."""
    return _clamp(50.0 + z * 15.0)


def _recovery_score(
    agg: dict[str, dict[str, Any]],
    baselines: dict[str, UserBaseline],
) -> int | None:
    """Weighted composite: HRV 40%, resting HR (inverted) 30%, sleep 30%."""
    weighted_sum = 0.0
    total_weight = 0.0

    for mt, weight in _RECOVERY_WEIGHTS.items():
        avg = agg.get(mt, {}).get("current_avg")
        bl = baselines.get(mt)
        if avg is None or bl is None:
            continue

        z = _safe_z(avg, bl.baseline_value, bl.std_deviation)
        # Invert resting_hr z-score so lower HR → higher recovery score
        if mt in _LOWER_IS_BETTER:
            z = -z
        weighted_sum += _z_to_score(z) * weight
        total_weight += weight

    if total_weight == 0:
        return None
    return round(weighted_sum / total_weight)


def _sleep_score(agg: dict[str, dict[str, Any]]) -> int | None:
    """Sleep score based on proximity to the 7–9h optimal range +
    consistency penalty."""
    sleep = agg.get("sleep_hours", {})
    avg = sleep.get("current_avg")
    if avg is None:
        return None

    # Base score: distance from 8h ideal
    base = 100.0 - abs(avg - 8.0) * 20.0
    base = _clamp(base)

    # Consistency penalty: std deviation of this week's sleep values
    values = sleep.get("values", [])
    if len(values) >= 2:
        std = pstdev(values)
        penalty = std * 5.0
    else:
        penalty = 0.0

    return round(_clamp(base - penalty))


def _activity_score(
    agg: dict[str, dict[str, Any]],
    baselines: dict[str, UserBaseline],
    trend: str,
) -> int | None:
    """Steps relative to baseline with a trend bonus/penalty."""
    steps = agg.get("steps", {})
    avg = steps.get("current_avg")
    bl = baselines.get("steps")
    if avg is None or bl is None or bl.baseline_value == 0:
        return None

    base = (avg / bl.baseline_value) * 80.0
    base = _clamp(base)

    if trend == "improving":
        base += 10.0
    elif trend == "declining":
        base -= 10.0

    return round(_clamp(base))


# ---------------------------------------------------------------------------
# Step 5 — Notable day detection
# ---------------------------------------------------------------------------

def _detect_notable_days(
    matrix: dict[date, dict[str, float | None]],
    z_matrix: dict[date, dict[str, float | None]],
) -> list[dict[str, Any]]:
    """Flag days where a metric's z-score exceeds ±2σ.  Cap at 5."""
    notable: list[dict[str, Any]] = []

    for day in sorted(matrix.keys()):
        for mt in METRIC_TYPES:
            z = z_matrix[day].get(mt)
            val = matrix[day].get(mt)
            if z is None or val is None:
                continue
            if abs(z) >= _NOTABLE_Z_THRESHOLD:
                notable.append({
                    "date": day.isoformat(),
                    "metric_type": mt,
                    "value": round(val, 2),
                    "z_score": z,
                    "flag": "high" if z > 0 else "low",
                })

    # Sort by absolute z-score descending, then cap
    notable.sort(key=lambda x: abs(x["z_score"]), reverse=True)
    return notable[:_MAX_NOTABLE_DAYS]


# ---------------------------------------------------------------------------
# Step 6 — Assemble output dict  (public entry point)
# ---------------------------------------------------------------------------

def compute_weekly_summary(
    db: Session,
    user_id: uuid.UUID,
    week_start: date,
    week_end: date,
) -> dict[str, Any]:
    """Run the full 6-step metrics engine and return the summary dict.

    Args:
        db: Active SQLAlchemy session.
        user_id: Authenticated user UUID.
        week_start: Monday of the target week.
        week_end: Sunday of the target week.

    Returns:
        The structured summary dict ready for the API / PII scrubber / AI.
    """

    # -- Step 1: fetch data ------------------------------------------------
    current_metrics = _fetch_metrics(db, user_id, week_start, week_end)
    baselines = _fetch_baselines(db, user_id)

    prior_start = week_start - timedelta(days=7)
    prior_end = week_start - timedelta(days=1)
    prior_metrics = _fetch_metrics(db, user_id, prior_start, prior_end)

    # -- Step 2: daily aggregation -----------------------------------------
    matrix = _build_daily_matrix(current_metrics, week_start, week_end)
    agg = _per_metric_aggregates(matrix)

    # Check for insufficient data: fewer than 3 days with *any* metric
    all_days_with_data = {
        day
        for day, row in matrix.items()
        if any(v is not None for v in row.values())
    }
    insufficient_data = len(all_days_with_data) < 3

    # -- Step 3: statistical analysis --------------------------------------
    z_matrix = _compute_daily_z_scores(matrix, baselines)
    prior_avgs = _prior_week_avgs(prior_metrics)

    per_metric: list[dict[str, Any]] = []
    for mt in METRIC_TYPES:
        info = agg[mt]
        bl = baselines.get(mt)
        avg = info["current_avg"]

        # Weekly z-score
        if avg is not None and bl is not None:
            weekly_z = round(
                _safe_z(avg, bl.baseline_value, bl.std_deviation), 2
            )
            delta_pct_bl = _safe_pct_change(avg, bl.baseline_value)
        else:
            weekly_z = None
            delta_pct_bl = None

        # Week-over-week delta
        prior_avg = prior_avgs.get(mt)
        if avg is not None and prior_avg is not None:
            wow_delta = _safe_pct_change(avg, prior_avg)
        else:
            wow_delta = None

        trend = _classify_trend(wow_delta, mt)

        per_metric.append({
            "type": mt,
            "current_avg": avg,
            "current_min": info["current_min"],
            "current_max": info["current_max"],
            "days_with_data": info["days_with_data"],
            "baseline": round(bl.baseline_value, 2) if bl else None,
            "std_deviation": round(bl.std_deviation, 2) if bl else None,
            "delta_pct_vs_baseline": delta_pct_bl,
            "weekly_z_score": weekly_z,
            "wow_delta_pct": wow_delta,
            "trend": trend,
        })

    # -- Step 4: composite scores ------------------------------------------
    if insufficient_data:
        composite_scores = {
            "recovery": None,
            "sleep": None,
            "activity": None,
        }
    else:
        # Need steps trend for activity score
        steps_trend = next(
            (m["trend"] for m in per_metric if m["type"] == "steps"),
            "stable",
        )
        composite_scores = {
            "recovery": _recovery_score(agg, baselines),
            "sleep": _sleep_score(agg),
            "activity": _activity_score(agg, baselines, steps_trend),
        }

    # -- Step 5: notable days ----------------------------------------------
    notable_days = _detect_notable_days(matrix, z_matrix)

    # -- Step 6: assemble output -------------------------------------------
    return {
        "week": f"{week_start.isoformat()} to {week_end.isoformat()}",
        "insufficient_data": insufficient_data,
        "composite_scores": composite_scores,
        "per_metric": per_metric,
        "notable_days": notable_days,
        "prior_week_avgs": {
            mt: prior_avgs.get(mt) for mt in METRIC_TYPES
        },
    }
