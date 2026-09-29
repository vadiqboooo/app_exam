"""Add OGE/EGE type to imported study groups."""

import re

import sqlalchemy as sa
from alembic import op

revision = "a13c9d8e7412"
down_revision = "f9357d6be215"
branch_labels = None
depends_on = None

EXAM_FORMAT = re.compile(r"(?<!\w)(ОГЭ|ЕГЭ)(?!\w)", re.IGNORECASE)


def upgrade():
    # A direct ADD COLUMN keeps the referenced table in place on SQLite. Rebuilding it
    # through batch mode would temporarily violate membership foreign keys.
    op.add_column("study_groups", sa.Column("exam_format", sa.String(), nullable=True))

    connection = op.get_bind()
    groups = sa.table(
        "study_groups",
        sa.column("id", sa.Integer),
        sa.column("source_name", sa.String),
        sa.column("exam_format", sa.String),
    )
    for group_id, source_name in connection.execute(sa.select(groups.c.id, groups.c.source_name)):
        match = EXAM_FORMAT.search(source_name)
        if match:
            exam_format = "oge" if match.group(1).upper() == "ОГЭ" else "ege"
            connection.execute(
                groups.update().where(groups.c.id == group_id).values(exam_format=exam_format)
            )


def downgrade():
    op.drop_column("study_groups", "exam_format")
