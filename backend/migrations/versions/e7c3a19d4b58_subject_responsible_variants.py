"""Responsible teacher, duration and printable variants of a subject."""

import sqlalchemy as sa
from alembic import op

revision = "e7c3a19d4b58"
down_revision = "d5b92e7a1c38"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("subjects") as batch_op:
        batch_op.add_column(sa.Column("duration_minutes", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("responsible_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("responsible_since", sa.DateTime(), nullable=True))
        batch_op.create_index("ix_subjects_responsible_id", ["responsible_id"])
        batch_op.create_foreign_key(
            "fk_subjects_responsible_id_staff", "staff", ["responsible_id"], ["id"]
        )
    op.create_table(
        "subject_variants",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("subject_id", sa.Integer(), sa.ForeignKey("subjects.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("content_type", sa.String(), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
    )
    op.create_index("ix_subject_variants_subject_id", "subject_variants", ["subject_id"])


def downgrade():
    op.drop_index("ix_subject_variants_subject_id", table_name="subject_variants")
    op.drop_table("subject_variants")
    with op.batch_alter_table("subjects") as batch_op:
        batch_op.drop_constraint("fk_subjects_responsible_id_staff", type_="foreignkey")
        batch_op.drop_index("ix_subjects_responsible_id")
        batch_op.drop_column("responsible_since")
        batch_op.drop_column("responsible_id")
        batch_op.drop_column("duration_minutes")
