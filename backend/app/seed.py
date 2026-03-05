"""
Seed script — generate 3 test users with 90 days of health data each.

These users are for backend API testing via Swagger only. They have NO
password hashes and cannot log in via the frontend.

Usage:
    python -m app.seed          (requires DATABASE_URL env var or .env)
"""

import random
import uuid
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.models import DataSource, HealthMetric, SurveyQuestion, User
from app.services.baseline_service import calculate_baselines

# ---------------------------------------------------------------------------
# User profiles
# ---------------------------------------------------------------------------

SEED_USERS = [
    {
        "id": uuid.UUID("00000000-0000-0000-0000-000000000001"),
        "email": "consistent@test.local",
        "name": "Consistent Casey",
        "timezone": "America/New_York",
        "profile": {
            "sleep_hours": (7.0, 8.0),
            "hrv": (55.0, 70.0),
            "resting_hr": (58.0, 64.0),
            "steps": (8000.0, 12000.0),
        },
    },
    {
        "id": uuid.UUID("00000000-0000-0000-0000-000000000002"),
        "email": "poorsleep@test.local",
        "name": "Sleepless Sam",
        "timezone": "America/Chicago",
        "profile": {
            "sleep_hours": (4.5, 6.5),
            "hrv": (35.0, 55.0),
            "resting_hr": (62.0, 72.0),
            "steps": (5000.0, 9000.0),
        },
    },
    {
        "id": uuid.UUID("00000000-0000-0000-0000-000000000003"),
        "email": "active@test.local",
        "name": "Active Alex",
        "timezone": "America/Los_Angeles",
        "profile": {
            "sleep_hours": (6.5, 8.0),
            "hrv": (60.0, 85.0),
            "resting_hr": (48.0, 58.0),
            "steps": (10000.0, 18000.0),
        },
    },
]

METRIC_TYPES = ["sleep_hours", "hrv", "resting_hr", "steps"]

# ---------------------------------------------------------------------------
# Initial survey questions
# ---------------------------------------------------------------------------

SEED_SURVEY_QUESTIONS = [
    {
        "category": "sleep",
        "question_text": "How would you describe your typical sleep quality?",
        "response_type": "single_choice",
        "options": {"choices": ["Poor", "Fair", "Good", "Excellent"]},
        "display_order": 1,
    },
    {
        "category": "sleep",
        "question_text": "How consistent is your bedtime (within 30 minutes) on most nights?",
        "response_type": "single_choice",
        "options": {"choices": ["Rarely", "Sometimes", "Usually", "Always"]},
        "display_order": 2,
    },
    {
        "category": "exercise",
        "question_text": "How many days per week do you typically exercise for at least 30 minutes?",
        "response_type": "single_choice",
        "options": {"choices": ["0", "1-2", "3-4", "5+"]},
        "display_order": 3,
    },
    {
        "category": "exercise",
        "question_text": "What best describes your typical exercise intensity?",
        "response_type": "single_choice",
        "options": {"choices": ["Light (walking, stretching)", "Moderate (jogging, cycling)", "Vigorous (running, HIIT, heavy weights)", "Mixed"]},
        "display_order": 4,
    },
    {
        "category": "diet",
        "question_text": "How would you rate the overall quality of your diet?",
        "response_type": "single_choice",
        "options": {"choices": ["Poor", "Fair", "Good", "Excellent"]},
        "display_order": 5,
    },
    {
        "category": "diet",
        "question_text": "How many servings of fruits and vegetables do you eat on a typical day?",
        "response_type": "single_choice",
        "options": {"choices": ["0-1", "2-3", "4-5", "6+"]},
        "display_order": 6,
    },
    {
        "category": "stress",
        "question_text": "How would you rate your average daily stress level?",
        "response_type": "single_choice",
        "options": {"choices": ["Low", "Moderate", "High", "Very high"]},
        "display_order": 7,
    },
    {
        "category": "lifestyle",
        "question_text": "How many alcoholic drinks do you have in a typical week?",
        "response_type": "single_choice",
        "options": {"choices": ["0", "1-3", "4-7", "8+"]},
        "display_order": 8,
    },
]


# ---------------------------------------------------------------------------
# Data generation helpers
# ---------------------------------------------------------------------------

def _generate_value(low: float, high: float, is_weekend: bool) -> float:
    """Generate a realistic value with day-to-day variance and weekend patterns."""
    base = random.uniform(low, high)
    # Add small daily noise (±5%)
    noise = base * random.uniform(-0.05, 0.05)
    # Weekend effect: slightly more sleep/steps variance
    if is_weekend:
        noise += base * random.uniform(-0.03, 0.03)
    return round(base + noise, 1)


def generate_user_metrics(
    user_id: uuid.UUID,
    source_id: uuid.UUID,
    profile: dict[str, tuple[float, float]],
    days: int = 90,
    end_date: date | None = None,
) -> list[HealthMetric]:
    """Generate `days` of health metrics for one user."""
    if end_date is None:
        end_date = date.today()

    metrics = []
    for day_offset in range(days):
        d = end_date - timedelta(days=day_offset)
        is_weekend = d.weekday() >= 5

        for metric_type in METRIC_TYPES:
            low, high = profile[metric_type]
            value = _generate_value(low, high, is_weekend)

            metrics.append(
                HealthMetric(
                    user_id=user_id,
                    source_id=source_id,
                    date=d,
                    metric_type=metric_type,
                    value=value,
                )
            )

    return metrics


# ---------------------------------------------------------------------------
# Seed for a single user (reused by onboarding endpoint)
# ---------------------------------------------------------------------------

def seed_demo_data_for_user(
    db: Session,
    user_id: uuid.UUID,
    days: int = 90,
) -> DataSource:
    """
    Generate demo health data for an existing user.
    Creates a manual data source, 90 days of metrics, and calculates baselines.
    Returns the created DataSource.
    """
    # Create manual data source
    source = DataSource(user_id=user_id, source_type="manual", config={"origin": "demo_seed"})
    db.add(source)
    db.flush()  # get source.id

    # Use the "consistent" profile as default for real signup users
    profile = SEED_USERS[0]["profile"]
    metrics = generate_user_metrics(user_id, source.id, profile, days=days)
    db.add_all(metrics)
    db.commit()

    # Calculate baselines
    calculate_baselines(db, user_id)

    return source


# ---------------------------------------------------------------------------
# Full seed (3 test users) — run via `python -m app.seed`
# ---------------------------------------------------------------------------

def run_seed():
    """Create 3 test users with 90 days of data each. Idempotent — skips existing users."""
    db = SessionLocal()
    try:
        seed_survey_questions(db)

        for user_data in SEED_USERS:
            # Skip if user already exists
            existing = db.query(User).filter(User.id == user_data["id"]).first()
            if existing:
                print(f"  Skipping {user_data['name']} (already exists)")
                continue

            # Create user (no password — backend testing only)
            user = User(
                id=user_data["id"],
                email=user_data["email"],
                name=user_data["name"],
                timezone=user_data["timezone"],
            )
            db.add(user)
            db.flush()

            # Create data source
            source = DataSource(
                user_id=user.id,
                source_type="manual",
                config={"origin": "seed_script"},
            )
            db.add(source)
            db.flush()

            # Generate metrics
            metrics = generate_user_metrics(user.id, source.id, user_data["profile"])
            db.add_all(metrics)
            db.commit()

            # Calculate baselines
            calculate_baselines(db, user.id)

            print(f"  Seeded {user_data['name']}: {len(metrics)} metrics + baselines")

        print("Seed complete.")
    finally:
        db.close()


if __name__ == "__main__":
    run_seed()


# ---------------------------------------------------------------------------
# Survey questions seeder (also used standalone)
# ---------------------------------------------------------------------------

def seed_survey_questions(db: Session | None = None) -> int:
    """Insert initial survey questions if none exist. Returns count inserted."""
    close = False
    if db is None:
        db = SessionLocal()
        close = True
    try:
        existing = db.query(SurveyQuestion).count()
        if existing > 0:
            print(f"  Survey questions already seeded ({existing} found) — skipping")
            return 0

        for q in SEED_SURVEY_QUESTIONS:
            db.add(SurveyQuestion(**q))

        db.commit()
        print(f"  Seeded {len(SEED_SURVEY_QUESTIONS)} survey questions")
        return len(SEED_SURVEY_QUESTIONS)
    finally:
        if close:
            db.close()
