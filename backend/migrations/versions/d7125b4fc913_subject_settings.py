"""Central subject and exam-format settings."""

import json

import sqlalchemy as sa
from alembic import op

revision = "d7125b4fc913"
down_revision = "b6d19c4a7e21"
branch_labels = None
depends_on = None


def upgrade():
    subjects = op.create_table(
        "subjects",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("format", sa.String(), nullable=False),
        sa.Column("tasks", sa.JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.CheckConstraint("format IN ('ege', 'oge')", name=op.f("ck_subjects_format")),
        sa.UniqueConstraint("name", "format", name=op.f("uq_subjects_name")),
    )

    # Preserve useful structures already configured in existing exams. Each
    # setting is only a template; historical exams keep their own snapshot.
    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            "SELECT id, subject, format, structure_data FROM exams "
            "WHERE format IN ('ege', 'oge') ORDER BY id DESC"
        )
    ).mappings()
    seen = set()
    values = []
    for row in rows:
        key = (row["subject"].casefold(), row["format"])
        if key in seen:
            continue
        seen.add(key)
        structure = row["structure_data"]
        if isinstance(structure, str):
            structure = json.loads(structure)
        values.append(
            {
                "name": row["subject"],
                "format": row["format"],
                "tasks": (structure or {}).get("tasks", []),
                "is_active": True,
            }
        )
    if values:
        op.bulk_insert(subjects, values)


def downgrade():
    op.drop_table("subjects")
