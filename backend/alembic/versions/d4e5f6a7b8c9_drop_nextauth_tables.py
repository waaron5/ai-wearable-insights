"""drop_nextauth_tables

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-03-09 14:00:00.000000

Drop the three NextAuth tables that are no longer needed now that
authentication is handled entirely by FastAPI JWT auth.
Also removes the legacy NextAuth columns from the users table.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop NextAuth tables
    op.drop_table('verification_tokens')
    op.drop_table('sessions')
    op.drop_table('accounts')

    # Remove legacy NextAuth columns from users
    op.drop_column('users', 'emailVerified')
    op.drop_column('users', 'image')


def downgrade() -> None:
    # Restore legacy columns
    op.add_column('users', sa.Column('emailVerified', sa.DateTime(), nullable=True))
    op.add_column('users', sa.Column('image', sa.String(2048), nullable=True))

    # Restore NextAuth tables
    op.create_table(
        'accounts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('userId', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('type', sa.String(255), nullable=False),
        sa.Column('provider', sa.String(255), nullable=False),
        sa.Column('providerAccountId', sa.String(255), nullable=False),
        sa.Column('refresh_token', sa.Text()),
        sa.Column('access_token', sa.Text()),
        sa.Column('expires_at', sa.Integer()),
        sa.Column('token_type', sa.String(255)),
        sa.Column('scope', sa.String(255)),
        sa.Column('id_token', sa.Text()),
        sa.Column('session_state', sa.String(255)),
    )
    op.create_table(
        'sessions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('sessionToken', sa.String(255), unique=True, nullable=False),
        sa.Column('userId', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('expires', sa.DateTime(), nullable=False),
    )
    op.create_table(
        'verification_tokens',
        sa.Column('identifier', sa.String(255), primary_key=True),
        sa.Column('token', sa.String(255), unique=True, nullable=False),
        sa.Column('expires', sa.DateTime(), nullable=False),
    )
