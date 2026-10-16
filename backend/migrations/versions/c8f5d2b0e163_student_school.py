"""School of a pupil, set when a group roster is imported."""

import sqlalchemy as sa
from alembic import op

revision = "c8f5d2b0e163"
down_revision = "b7e4c1a9d052"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("students", sa.Column("school", sa.String(), nullable=True))


def downgrade():
    with op.batch_alter_table("students") as batch:
        batch.drop_column("school")
