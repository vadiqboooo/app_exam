"""Personal access codes with lockout state for students and teachers."""

import sqlalchemy as sa
from alembic import op

revision = "c4a81d2f5b67"
down_revision = "a13c9d8e7412"
branch_labels = None
depends_on = None

LOCK_COLUMNS = ("last_login_at", "locked_until", "lock_level", "failed_attempts")


def _lock_columns():
    return [
        sa.Column("failed_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("lock_level", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("locked_until", sa.DateTime(), nullable=True),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
    ]


def upgrade():
    with op.batch_alter_table("students") as batch_op:
        for column in _lock_columns():
            batch_op.add_column(column)
    with op.batch_alter_table("staff") as batch_op:
        batch_op.add_column(sa.Column("access_code_hash", sa.String(), nullable=True))
        for column in _lock_columns():
            batch_op.add_column(column)


def downgrade():
    with op.batch_alter_table("staff") as batch_op:
        for name in LOCK_COLUMNS:
            batch_op.drop_column(name)
        batch_op.drop_column("access_code_hash")
    with op.batch_alter_table("students") as batch_op:
        for name in LOCK_COLUMNS:
            batch_op.drop_column(name)
