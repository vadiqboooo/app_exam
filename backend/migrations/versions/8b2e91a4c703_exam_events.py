"""Named exam events with subjects, schools and capacity-limited slots."""

import sqlalchemy as sa
from alembic import op

revision = "8b2e91a4c703"
down_revision = "cf7342210e6c"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "exam_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(), nullable=False),
    )
    op.create_table(
        "exam_schools",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_id", sa.Integer(), sa.ForeignKey("exam_events.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("address", sa.String(), nullable=True),
        sa.UniqueConstraint("event_id", "name"),
    )
    op.create_index("ix_exam_schools_event_id", "exam_schools", ["event_id"])
    # Native nullable ADD COLUMN preserves referenced tables and existing results on SQLite.
    if op.get_bind().dialect.name == "sqlite":
        op.execute(
            "ALTER TABLE exams ADD COLUMN event_id INTEGER "
            "CONSTRAINT fk_exams_event_id_exam_events REFERENCES exam_events(id)"
        )
    else:
        op.add_column(
            "exams",
            sa.Column(
                "event_id",
                sa.Integer(),
                sa.ForeignKey("exam_events.id"),
                nullable=True,
            ),
        )
    op.add_column(
        "exams",
        sa.Column(
            "format",
            sa.String(),
            sa.CheckConstraint("format IN ('ege', 'oge')", name=op.f("ck_exams_format")),
            nullable=True,
        ),
    )
    op.create_index("ix_exams_event_id", "exams", ["event_id"])
    op.create_table(
        "exam_slots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("exam_id", sa.Integer(), sa.ForeignKey("exams.id"), nullable=False),
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("exam_schools.id"), nullable=False),
        sa.Column("starts_at", sa.DateTime(), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=False),
        sa.CheckConstraint("capacity > 0", name="capacity"),
        sa.UniqueConstraint("exam_id", "school_id", "starts_at"),
    )
    for column in ("exam_id", "school_id", "starts_at"):
        op.create_index(f"ix_exam_slots_{column}", "exam_slots", [column])
    if op.get_bind().dialect.name == "sqlite":
        op.execute(
            "ALTER TABLE participations ADD COLUMN slot_id INTEGER "
            "CONSTRAINT fk_participations_slot_id_exam_slots REFERENCES exam_slots(id)"
        )
    else:
        op.add_column(
            "participations",
            sa.Column(
                "slot_id",
                sa.Integer(),
                sa.ForeignKey("exam_slots.id"),
                nullable=True,
            ),
        )
    op.create_index("ix_participations_slot_id", "participations", ["slot_id"])


def downgrade():
    op.drop_index("ix_participations_slot_id", "participations")
    op.drop_column("participations", "slot_id")
    op.drop_table("exam_slots")
    op.drop_index("ix_exams_event_id", "exams")
    op.drop_column("exams", "format")
    op.drop_column("exams", "event_id")
    op.drop_table("exam_schools")
    op.drop_table("exam_events")
