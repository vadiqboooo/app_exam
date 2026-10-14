"""Store the selected visual theme on an exam event."""

import sqlalchemy as sa
from alembic import op

revision = "a4c7e9b2d615"
down_revision = "f2b4c8e6d137"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("exam_events", sa.Column("theme_key", sa.String(), nullable=True))


def downgrade():
    with op.batch_alter_table("exam_events") as batch:
        batch.drop_column("theme_key")
