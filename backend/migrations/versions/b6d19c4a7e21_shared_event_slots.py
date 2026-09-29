"""Make school/time capacity shared by all subjects in an exam event."""

import sqlalchemy as sa
from alembic import op

revision = "b6d19c4a7e21"
down_revision = "8b2e91a4c703"
branch_labels = None
depends_on = None


def upgrade():
    dialect = op.get_bind().dialect.name
    if dialect == "sqlite":
        op.execute(
            "ALTER TABLE exam_slots ADD COLUMN event_id INTEGER "
            "CONSTRAINT fk_exam_slots_event_id_exam_events REFERENCES exam_events(id)"
        )
    else:
        op.add_column(
            "exam_slots",
            sa.Column(
                "event_id",
                sa.Integer(),
                sa.ForeignKey("exam_events.id"),
                nullable=True,
            ),
        )

    op.execute(
        "UPDATE exam_slots SET event_id = "
        "(SELECT event_id FROM exams WHERE exams.id = exam_slots.exam_id)"
    )

    # Older versions created one quota per subject. Collapse equal school/time
    # quotas into one event quota while keeping existing registrations attached.
    connection = op.get_bind()
    duplicate_groups = connection.execute(
        sa.text(
            "SELECT event_id, school_id, starts_at, MIN(id) AS kept_id, "
            "MAX(capacity) AS capacity FROM exam_slots "
            "WHERE event_id IS NOT NULL GROUP BY event_id, school_id, starts_at "
            "HAVING COUNT(*) > 1"
        )
    ).mappings()
    for group in duplicate_groups:
        duplicate_ids = connection.execute(
            sa.text(
                "SELECT id FROM exam_slots WHERE event_id = :event_id "
                "AND school_id = :school_id AND starts_at = :starts_at AND id != :kept_id"
            ),
            group,
        ).scalars()
        for duplicate_id in list(duplicate_ids):
            connection.execute(
                sa.text(
                    "UPDATE participations SET slot_id = :kept_id WHERE slot_id = :duplicate_id"
                ),
                {"kept_id": group["kept_id"], "duplicate_id": duplicate_id},
            )
            connection.execute(
                sa.text("DELETE FROM exam_slots WHERE id = :duplicate_id"),
                {"duplicate_id": duplicate_id},
            )
        booked = connection.execute(
            sa.text(
                "SELECT COUNT(*) FROM participations "
                "WHERE slot_id = :kept_id AND status != 'cancelled'"
            ),
            group,
        ).scalar_one()
        connection.execute(
            sa.text("UPDATE exam_slots SET capacity = :capacity WHERE id = :kept_id"),
            {"kept_id": group["kept_id"], "capacity": max(group["capacity"], booked)},
        )

    op.create_index("ix_exam_slots_event_id", "exam_slots", ["event_id"])
    op.create_index(
        "ux_exam_slots_event_school_start",
        "exam_slots",
        ["event_id", "school_id", "starts_at"],
        unique=True,
    )


def downgrade():
    op.drop_index("ux_exam_slots_event_school_start", table_name="exam_slots")
    op.drop_index("ix_exam_slots_event_id", table_name="exam_slots")
    op.drop_column("exam_slots", "event_id")
