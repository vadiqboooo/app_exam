"""Printable variants are attached to exam events."""

import sqlalchemy as sa
from alembic import op

revision = "a2c5e7f9b104"
down_revision = "f1a4d8c2e703"
branch_labels = None
depends_on = None


def _key(value: str) -> str:
    return (value or "").lower().replace("ё", "е").strip()


def upgrade():
    op.create_table(
        "variant_events",
        sa.Column("variant_id", sa.Integer(), sa.ForeignKey("subject_variants.id"), nullable=False),
        sa.Column("event_id", sa.Integer(), sa.ForeignKey("exam_events.id"), nullable=False),
        sa.PrimaryKeyConstraint("variant_id", "event_id"),
    )
    op.create_index("ix_variant_events_event_id", "variant_events", ["event_id"])
    # Variants uploaded before this change keep working: they join every event of their subject.
    connection = op.get_bind()
    subjects = {
        row.id: (_key(row.name), row.format)
        for row in connection.execute(sa.text("SELECT id, name, format FROM subjects"))
    }
    events: dict[tuple[str, str], set[int]] = {}
    for row in connection.execute(
        sa.text("SELECT event_id, subject, format FROM exams WHERE event_id IS NOT NULL")
    ):
        events.setdefault((_key(row.subject), row.format), set()).add(row.event_id)
    links = [
        {"variant_id": row.id, "event_id": event_id}
        for row in connection.execute(sa.text("SELECT id, subject_id FROM subject_variants"))
        for event_id in events.get(subjects.get(row.subject_id), ())
    ]
    if links:
        connection.execute(
            sa.text(
                "INSERT INTO variant_events (variant_id, event_id) VALUES (:variant_id, :event_id)"
            ),
            links,
        )


def downgrade():
    op.drop_index("ix_variant_events_event_id", table_name="variant_events")
    op.drop_table("variant_events")
