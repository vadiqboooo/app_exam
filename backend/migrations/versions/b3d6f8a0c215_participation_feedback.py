"""Note for the student and the parent, with the delivery status."""

import sqlalchemy as sa
from alembic import op

revision = "b3d6f8a0c215"
down_revision = "a2c5e7f9b104"
branch_labels = None
depends_on = None


def upgrade():
    # Plain ADD COLUMN: rebuilding `participations` is unnecessary and slow on a full database.
    op.add_column("participations", sa.Column("feedback", sa.String(), nullable=True))
    op.add_column(
        "participations",
        sa.Column("parent_status", sa.String(), nullable=False, server_default="none"),
    )


def downgrade():
    op.drop_column("participations", "parent_status")
    op.drop_column("participations", "feedback")
