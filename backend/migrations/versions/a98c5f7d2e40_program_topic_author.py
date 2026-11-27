"""Store the author of each program topic."""

import sqlalchemy as sa
from alembic import op

revision = "a98c5f7d2e40"
down_revision = "f73c6d8a4e21"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("program_topics", sa.Column("author_name", sa.String(), nullable=True))


def downgrade():
    op.drop_column("program_topics", "author_name")
