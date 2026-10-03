"""Remember who entered the scores of a participation."""

import sqlalchemy as sa
from alembic import op

revision = "d5b92e7a1c38"
down_revision = "c4a81d2f5b67"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("participations") as batch_op:
        batch_op.add_column(sa.Column("checked_by", sa.String(), nullable=True))


def downgrade():
    with op.batch_alter_table("participations") as batch_op:
        batch_op.drop_column("checked_by")
