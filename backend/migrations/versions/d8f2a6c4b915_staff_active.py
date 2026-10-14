"""Archive staff missing from a complete school import."""

import sqlalchemy as sa
from alembic import op

revision = "d8f2a6c4b915"
down_revision = "c4e7a9b1d326"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "staff",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade():
    op.drop_column("staff", "is_active")
