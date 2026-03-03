"""
SQLAlchemy ORM models — all 11 tables.

8 app tables:
  users, data_sources, health_metrics, weekly_debriefs,
  chat_sessions, chat_messages, debrief_feedback, user_baselines

3 NextAuth tables:
  accounts, sessions, verification_tokens
"""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


# ---------------------------------------------------------------------------
# Helper defaults
# ---------------------------------------------------------------------------

def _uuid() -> uuid.UUID:
    return uuid.uuid4()


def _now() -> datetime:
    return datetime.utcnow()


# ===========================================================================
# APP TABLES
# ===========================================================================


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String(255))
    hashed_password: Mapped[str | None] = mapped_column(String(255))

    # NextAuth-managed columns
    emailVerified: Mapped[datetime | None] = mapped_column("emailVerified", DateTime)
    image: Mapped[str | None] = mapped_column(String(2048))

    # App-specific columns
    timezone: Mapped[str] = mapped_column(String(64), server_default="America/New_York")
    notification_email: Mapped[str | None] = mapped_column(String(320))
    email_notifications_enabled: Mapped[bool] = mapped_column(Boolean, server_default="true")
    onboarded_at: Mapped[datetime | None] = mapped_column(DateTime)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=_now)

    # Relationships
    data_sources = relationship("DataSource", back_populates="user", cascade="all, delete-orphan")
    health_metrics = relationship("HealthMetric", back_populates="user", cascade="all, delete-orphan")
    weekly_debriefs = relationship("WeeklyDebrief", back_populates="user", cascade="all, delete-orphan")
    chat_sessions = relationship("ChatSession", back_populates="user", cascade="all, delete-orphan")
    baselines = relationship("UserBaseline", back_populates="user", cascade="all, delete-orphan")


class DataSource(Base):
    __tablename__ = "data_sources"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)  # manual, apple_health, garmin, fitbit, whoop, oura
    config: Mapped[dict | None] = mapped_column(JSONB)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=_now)

    user = relationship("User", back_populates="data_sources")
    health_metrics = relationship("HealthMetric", back_populates="source")


class HealthMetric(Base):
    __tablename__ = "health_metrics"
    __table_args__ = (
        UniqueConstraint("user_id", "date", "metric_type", name="uq_health_metrics_user_date_type"),
        Index("ix_health_metrics_user_date", "user_id", "date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    source_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("data_sources.id", ondelete="SET NULL"))
    date: Mapped[date] = mapped_column(Date, nullable=False)
    metric_type: Mapped[str] = mapped_column(String(50), nullable=False)  # sleep_hours, hrv, resting_hr, steps
    value: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="health_metrics")
    source = relationship("DataSource", back_populates="health_metrics")


class WeeklyDebrief(Base):
    __tablename__ = "weekly_debriefs"
    __table_args__ = (
        UniqueConstraint("user_id", "week_start", name="uq_weekly_debriefs_user_week"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    week_start: Mapped[date] = mapped_column(Date, nullable=False)
    week_end: Mapped[date] = mapped_column(Date, nullable=False)
    narrative: Mapped[str | None] = mapped_column(Text)
    highlights: Mapped[dict | None] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(20), server_default="pending")  # pending, generating, generated, sent, failed
    email_sent_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=_now)

    user = relationship("User", back_populates="weekly_debriefs")
    feedback = relationship("DebriefFeedback", back_populates="debrief", cascade="all, delete-orphan")


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=_now)

    user = relationship("User", back_populates="chat_sessions")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (
        Index("ix_chat_messages_session_created", "session_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # user, assistant
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    session = relationship("ChatSession", back_populates="messages")


class DebriefFeedback(Base):
    __tablename__ = "debrief_feedback"
    __table_args__ = (
        UniqueConstraint("debrief_id", "user_id", name="uq_debrief_feedback_debrief_user"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    debrief_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("weekly_debriefs.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # 1–5
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    debrief = relationship("WeeklyDebrief", back_populates="feedback")


class UserBaseline(Base):
    __tablename__ = "user_baselines"
    __table_args__ = (
        Index("ix_user_baselines_user_metric", "user_id", "metric_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    metric_type: Mapped[str] = mapped_column(String(50), nullable=False)
    baseline_value: Mapped[float] = mapped_column(Float, nullable=False)
    std_deviation: Mapped[float] = mapped_column(Float, nullable=False)
    calculated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="baselines")


# ===========================================================================
# NEXTAUTH TABLES
# ===========================================================================


class NextAuthAccount(Base):
    """NextAuth `accounts` table — matches @auth/pg-adapter schema."""
    __tablename__ = "accounts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    userId: Mapped[uuid.UUID] = mapped_column("userId", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type: Mapped[str] = mapped_column(String(255), nullable=False)
    provider: Mapped[str] = mapped_column(String(255), nullable=False)
    providerAccountId: Mapped[str] = mapped_column("providerAccountId", String(255), nullable=False)
    refresh_token: Mapped[str | None] = mapped_column(Text)
    access_token: Mapped[str | None] = mapped_column(Text)
    expires_at: Mapped[int | None] = mapped_column(Integer)
    token_type: Mapped[str | None] = mapped_column(String(255))
    scope: Mapped[str | None] = mapped_column(String(255))
    id_token: Mapped[str | None] = mapped_column(Text)
    session_state: Mapped[str | None] = mapped_column(String(255))


class NextAuthSession(Base):
    """NextAuth `sessions` table — matches @auth/pg-adapter schema."""
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    sessionToken: Mapped[str] = mapped_column("sessionToken", String(255), unique=True, nullable=False)
    userId: Mapped[uuid.UUID] = mapped_column("userId", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    expires: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class NextAuthVerificationToken(Base):
    """NextAuth `verification_tokens` table — matches @auth/pg-adapter schema."""
    __tablename__ = "verification_tokens"

    identifier: Mapped[str] = mapped_column(String(255), primary_key=True)
    token: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    expires: Mapped[datetime] = mapped_column(DateTime, nullable=False)
