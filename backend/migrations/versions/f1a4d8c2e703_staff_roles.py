"""An employee may hold several roles at once."""

import sqlalchemy as sa
from alembic import op

revision = "f1a4d8c2e703"
down_revision = "e7c3a19d4b58"
branch_labels = None
depends_on = None


def upgrade():
    # Plain ADD COLUMN: rebuilding `staff` would fail while groups and subjects point to it.
    op.add_column(
        "staff", sa.Column("is_teacher", sa.Boolean(), nullable=False, server_default=sa.true())
    )
    op.add_column(
        "staff", sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false())
    )
    op.add_column(
        "staff",
        sa.Column("is_responsible", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade():
    op.drop_column("staff", "is_responsible")
    op.drop_column("staff", "is_admin")
    op.drop_column("staff", "is_teacher")
