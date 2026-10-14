"""Configurable visual themes."""

import sqlalchemy as sa
from alembic import op

revision = "f2b4c8e6d137"
down_revision = "e9a3b7d5c026"
branch_labels = None
depends_on = None


def upgrade():
    table = op.create_table(
        "theme_settings",
        sa.Column("key", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.PrimaryKeyConstraint("key"),
    )
    op.bulk_insert(table, [{"key": "halloween", "title": "Хэллоуин", "is_enabled": True}])


def downgrade():
    op.drop_table("theme_settings")
