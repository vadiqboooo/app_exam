"""Self-registration of students from outside the school."""

import sqlalchemy as sa
from alembic import op

revision = "b7e4c1a9d052"
down_revision = "a4c7e9b2d615"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("students", sa.Column("phone", sa.String(), nullable=True))
    op.add_column(
        "students",
        sa.Column("self_registered", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "students",
        sa.Column("is_pending", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("students", sa.Column("requested_at", sa.DateTime(), nullable=True))


def downgrade():
    with op.batch_alter_table("students") as batch:
        batch.drop_column("requested_at")
        batch.drop_column("is_pending")
        batch.drop_column("self_registered")
        batch.drop_column("phone")
