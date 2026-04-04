"""Add google_sub to users table.

Revision ID: 0002_add_google_sub_to_users
Revises: 0001_initial_users_jobs
Create Date: 2026-04-05 00:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "0002_add_google_sub_to_users"
down_revision = "0001_initial_users_jobs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("google_sub", sa.String(length=128), nullable=True))
    op.create_index("ix_users_google_sub", "users", ["google_sub"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_google_sub", table_name="users")
    op.drop_column("users", "google_sub")
