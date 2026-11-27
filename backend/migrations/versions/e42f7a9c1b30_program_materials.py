"""Files attached to program topics."""

import sqlalchemy as sa
from alembic import op

revision = "e42f7a9c1b30"
down_revision = "c71e62a0d394"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "program_materials",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("topic_id", sa.Integer(), sa.ForeignKey("program_topics.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("content_type", sa.String(), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
    )
    op.create_index("ix_program_materials_topic_id", "program_materials", ["topic_id"])


def downgrade():
    op.drop_index("ix_program_materials_topic_id", table_name="program_materials")
    op.drop_table("program_materials")
