"""add_surveys_and_anonymous_data_lake

Revision ID: a1b2c3d4e5f6
Revises: 06962bf933de
Create Date: 2026-03-04 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '06962bf933de'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users: add data-sharing consent columns ────────────────────────
    op.add_column('users', sa.Column('data_sharing_consent', sa.Boolean, server_default='false'))
    op.add_column('users', sa.Column('data_sharing_consented_at', sa.DateTime))

    # ── survey_questions ───────────────────────────────────────────────
    op.create_table(
        'survey_questions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('category', sa.String(50), nullable=False),
        sa.Column('question_text', sa.Text, nullable=False),
        sa.Column('response_type', sa.String(30), nullable=False),
        sa.Column('options', postgresql.JSONB),
        sa.Column('display_order', sa.Integer, server_default='0'),
        sa.Column('is_active', sa.Boolean, server_default='true'),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
    )

    # ── survey_responses ───────────────────────────────────────────────
    op.create_table(
        'survey_responses',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('question_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('survey_questions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('response_value', sa.Text, nullable=False),
        sa.Column('survey_context', sa.String(30), nullable=False),
        sa.Column('responded_at', sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index('ix_survey_responses_user_question', 'survey_responses',
                    ['user_id', 'question_id'])

    # ── anonymous_profiles (NO FK to users) ────────────────────────────
    op.create_table(
        'anonymous_profiles',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('demographic_bucket', sa.String(30)),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
    )

    # ── anonymous_survey_data ──────────────────────────────────────────
    op.create_table(
        'anonymous_survey_data',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('anonymous_profile_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('anonymous_profiles.id', ondelete='CASCADE'), nullable=False),
        sa.Column('question_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('survey_questions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('response_value', sa.Text, nullable=False),
        sa.Column('collected_at', sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index('ix_anon_survey_profile_question', 'anonymous_survey_data',
                    ['anonymous_profile_id', 'question_id'])

    # ── anonymous_health_data ──────────────────────────────────────────
    op.create_table(
        'anonymous_health_data',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('anonymous_profile_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('anonymous_profiles.id', ondelete='CASCADE'), nullable=False),
        sa.Column('metric_type', sa.String(50), nullable=False),
        sa.Column('period_start', sa.Date, nullable=False),
        sa.Column('period_end', sa.Date, nullable=False),
        sa.Column('avg_value', sa.Float, nullable=False),
        sa.Column('min_value', sa.Float, nullable=False),
        sa.Column('max_value', sa.Float, nullable=False),
        sa.Column('std_deviation', sa.Float, nullable=False),
        sa.Column('sample_count', sa.Integer, nullable=False),
        sa.Column('collected_at', sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint('anonymous_profile_id', 'metric_type', 'period_start',
                            name='uq_anon_health_profile_metric_period'),
    )
    op.create_index('ix_anon_health_profile_period', 'anonymous_health_data',
                    ['anonymous_profile_id', 'period_start'])


def downgrade() -> None:
    op.drop_table('anonymous_health_data')
    op.drop_table('anonymous_survey_data')
    op.drop_table('anonymous_profiles')
    op.drop_table('survey_responses')
    op.drop_table('survey_questions')
    op.drop_column('users', 'data_sharing_consented_at')
    op.drop_column('users', 'data_sharing_consent')
