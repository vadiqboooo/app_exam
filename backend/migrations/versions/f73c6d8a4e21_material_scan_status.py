"""Record successful antivirus scans for lesson materials."""

import sqlalchemy as sa
from alembic import op

revision = "f73c6d8a4e21"
down_revision = "e42f7a9c1b30"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("program_materials", sa.Column("scanned_at", sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column("program_materials", "scanned_at")
