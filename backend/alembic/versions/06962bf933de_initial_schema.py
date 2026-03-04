"""initial_schema

Revision ID: 06962bf933de
Revises: 
Create Date: 2026-03-02 21:42:34.377952

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '06962bf933de'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users ──────────────────────────────────────────────────────────
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('email', sa.String(320), nullable=False),
        sa.Column('name', sa.String(255)),
        sa.Column('hashed_password', sa.String(255)),
        sa.Column('emailVerified', sa.DateTime),
        sa.Column('image', sa.String(2048)),
        sa.Column('timezone', sa.String(64), server_default='America/New_York'),
        sa.Column('notification_email', sa.String(320)),
        sa.Column('email_notifications_enabled', sa.Boolean, server_default='true'),
        sa.Column('onboarded_at', sa.DateTime),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)

    # ── NextAuth: accounts ─────────────────────────────────────────────
    op.create_table(
        'accounts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('userId', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('type', sa.String(255), nullable=False),
        sa.Column('provider', sa.String(255), nullable=False),
        sa.Column('providerAccountId', sa.String(255), nullable=False),
        sa.Column('refresh_token', sa.Text),
        sa.Column('access_token', sa.Text),
        sa.Column('expires_at', sa.Integer),
        sa.Column('token_type', sa.String(255)),
        sa.Column('scope', sa.String(255)),
        sa.Column('id_token', sa.Text),
        sa.Column('session_state', sa.String(255)),
    )

    # ── NextAuth: sessions ─────────────────────────────────────────────
    op.create_table(
        'sessions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('sessionToken', sa.String(255), nullable=False, unique=True),
        sa.Column('userId', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('expires', sa.DateTime, nullable=False),
    )

    # ── NextAuth: verification_tokens ──────────────────────────────────
    op.create_table(
        'verification_tokens',
        sa.Column('identifier', sa.String(255), primary_key=True),
        sa.Column('token', sa.String(255), nullable=False, unique=True),
        sa.Column('expires', sa.DateTime, nullable=False),
    )

    # ── data_sources ───────────────────────────────────────────────────
    op.create_table(
        'data_sources',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('source_type', sa.String(50), nullable=False),
        sa.Column('config', postgresql.JSONB),
        sa.Column('last_synced_at', sa.DateTime),
        sa.Column('is_active', sa.Boolean, server_default='true'),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
    )

    # ── health_metrics ─────────────────────────────────────────────────
    op.create_table(
        'health_metrics',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('source_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('data_sources.id', ondelete='SET NULL')),
        sa.Column('date', sa.Date, nullable=False),
        sa.Column('metric_type', sa.String(50), nullable=False),
        sa.Column('value', sa.Float, nullable=False),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint('user_id', 'date', 'metric_type', name='uq_health_metrics_user_date_type'),
    )
    op.create_index('ix_health_metrics_user_date', 'health_metrics', ['user_id', 'date'])

    # ── weekly_debriefs ────────────────────────────────────────────────
    op.create_table(
        'weekly_debriefs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('week_start', sa.Date, nullable=False),
        sa.Column('week_end', sa.Date, nullable=False),
        sa.Column('narrative', sa.Text),
        sa.Column('highlights', postgresql.JSONB),
        sa.Column('status', sa.String(20), server_default='pending'),
        sa.Column('email_sent_at', sa.DateTime),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint('user_id', 'week_start', name='uq_weekly_debriefs_user_week'),
    )

    # ── chat_sessions ──────────────────────────────────────────────────
    op.create_table(
        'chat_sessions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(255)),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
    )

    # ── chat_messages ──────────────────────────────────────────────────
    op.create_table(
        'chat_messages',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('session_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('chat_sessions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(20), nullable=False),
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index('ix_chat_messages_session_created', 'chat_messages', ['session_id', 'created_at'])

    # ── debrief_feedback ───────────────────────────────────────────────
    op.create_table(
        'debrief_feedback',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('debrief_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('weekly_debriefs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('rating', sa.SmallInteger, nullable=False),
        sa.Column('comment', sa.Text),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint('debrief_id', 'user_id', name='uq_debrief_feedback_debrief_user'),
    )

    # ── user_baselines ─────────────────────────────────────────────────
    op.create_table(
        'user_baselines',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('metric_type', sa.String(50), nullable=False),
        sa.Column('baseline_value', sa.Float, nullable=False),
        sa.Column('std_deviation', sa.Float, nullable=False),
        sa.Column('calculated_at', sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index('ix_user_baselines_user_metric', 'user_baselines', ['user_id', 'metric_type'])
    op.create_unique_constraint('uq_user_baselines_user_metric', 'user_baselines', ['user_id', 'metric_type'])


def downgrade() -> None:
    op.drop_table('user_baselines')
    op.drop_table('debrief_feedback')
    op.drop_table('chat_messages')
    op.drop_table('chat_sessions')
    op.drop_table('weekly_debriefs')
    op.drop_table('health_metrics')
    op.drop_table('data_sources')
    op.drop_table('verification_tokens')
    op.drop_table('sessions')
    op.drop_table('accounts')
    op.drop_table('users')
