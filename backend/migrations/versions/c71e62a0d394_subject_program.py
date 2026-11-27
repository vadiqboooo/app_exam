"""Subject program sections and reviewable topics."""

import sqlalchemy as sa
from alembic import op

revision = "c71e62a0d394"
down_revision = "d9b6e3a1f248"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "program_sections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "subject_id",
            sa.Integer(),
            sa.ForeignKey("subjects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
    )
    op.create_index("ix_program_sections_subject_id", "program_sections", ["subject_id"])
    op.create_table(
        "program_topics",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "section_id",
            sa.Integer(),
            sa.ForeignKey("program_sections.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="draft"),
        sa.Column("approved_by", sa.Integer(), sa.ForeignKey("staff.id", ondelete="SET NULL")),
        sa.Column("approved_at", sa.DateTime()),
        sa.CheckConstraint(
            "status IN ('draft', 'review', 'changes', 'approved')", name="ck_program_topics_status"
        ),
    )
    op.create_index("ix_program_topics_section_id", "program_topics", ["section_id"])


def downgrade():
    op.drop_index("ix_program_topics_section_id", table_name="program_topics")
    op.drop_table("program_topics")
    op.drop_index("ix_program_sections_subject_id", table_name="program_sections")
    op.drop_table("program_sections")
