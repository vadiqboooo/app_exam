"""Keep a manually archived group inactive across imports."""

import sqlalchemy as sa
from alembic import op

revision = "e9a3b7d5c026"
down_revision = "d8f2a6c4b915"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "study_groups",
        sa.Column(
            "is_manually_archived",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade():
    op.drop_column("study_groups", "is_manually_archived")
