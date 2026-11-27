"""Remember the teacher's position in training videos."""

import sqlalchemy as sa
from alembic import op

revision = "c63a9d7e5b21"
down_revision = "b56e31c9a240"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("training_progress", sa.Column(
        "video_position_seconds", sa.Integer(), nullable=False, server_default="0"
    ))


def downgrade():
    op.drop_column("training_progress", "video_position_seconds")
