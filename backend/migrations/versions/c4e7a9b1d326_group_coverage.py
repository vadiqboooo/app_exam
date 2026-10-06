"""Tasks of an exam a group has already covered."""

import sqlalchemy as sa
from alembic import op

revision = "c4e7a9b1d326"
down_revision = "b3d6f8a0c215"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "group_coverage",
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("study_groups.id"), nullable=False),
        sa.Column("exam_id", sa.Integer(), sa.ForeignKey("exams.id"), nullable=False),
        sa.Column("task_codes", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("group_id", "exam_id"),
    )
    op.create_index("ix_group_coverage_exam_id", "group_coverage", ["exam_id"])


def downgrade():
    op.drop_index("ix_group_coverage_exam_id", table_name="group_coverage")
    op.drop_table("group_coverage")
