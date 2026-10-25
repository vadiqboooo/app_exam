"""Remember which parts of the teacher guide an employee has finished."""

import sqlalchemy as sa
from alembic import op

revision = "d9b6e3a1f248"
down_revision = "c8f5d2b0e163"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("staff", sa.Column("training_groups_at", sa.DateTime(), nullable=True))
    op.add_column("staff", sa.Column("training_outside_at", sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column("staff", "training_outside_at")
    op.drop_column("staff", "training_groups_at")
