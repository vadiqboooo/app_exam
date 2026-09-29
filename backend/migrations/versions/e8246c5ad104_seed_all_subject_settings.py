"""Seed all subject settings extracted from crm_school_g school_new.db."""

import sqlalchemy as sa
from alembic import op

revision = "e8246c5ad104"
down_revision = "d7125b4fc913"
branch_labels = None
depends_on = None


SUBJECTS = [
    (
        "Биология",
        "ege",
        [1, 2, 1, 1, 1, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3],
    ),
    (
        "Биология",
        "oge",
        [1, 1, 1, 2, 2, 1, 2, 1, 2, 2, 2, 1, 3, 1, 1, 2, 2, 2, 2, 1, 2, 2, 2, 3, 3, 3],
    ),
    (
        "Химия",
        "ege",
        [
            1,
            1,
            1,
            1,
            1,
            2,
            2,
            2,
            1,
            1,
            1,
            1,
            1,
            2,
            2,
            1,
            1,
            1,
            1,
            1,
            1,
            2,
            2,
            2,
            1,
            1,
            1,
            1,
            2,
            2,
            4,
            5,
            3,
            4,
        ],
    ),
    ("Химия", "oge", [1, 1, 1, 2, 1, 1, 1, 1, 2, 2, 1, 2, 1, 1, 1, 1, 2, 1, 1, 3, 3, 3, 5]),
    (
        "Английский язык",
        "ege",
        [
            2,
            3,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            3,
            2,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            6,
            14,
            1,
            4,
            5,
            10,
        ],
    ),
    (
        "Английский язык",
        "oge",
        [
            1,
            1,
            1,
            1,
            5,
            1,
            1,
            1,
            1,
            1,
            1,
            6,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            10,
            2,
            6,
            7,
        ],
    ),
    (
        "География",
        "oge",
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ),
    ("История", "ege", [2, 1, 2, 3, 2, 2, 2, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 2, 3, 3]),
    (
        "История",
        "oge",
        [
            6,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            6,
            4,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            8,
            12,
            5,
            7,
            8,
        ],
    ),
    (
        "Информатика",
        "ege",
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2],
    ),
    ("Информатика", "oge", [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 3, 2, 2]),
    (
        "Математика",
        "oge",
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2],
    ),
    (
        "Математика (базовая)",
        "ege",
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ),
    ("Математика (профильная)", "ege", [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 3, 3, 3, 4, 5]),
    (
        "Физика",
        "ege",
        [1, 1, 1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 1, 2, 2, 1, 2, 2, 1, 1, 3, 2, 2, 3, 3, 4],
    ),
    ("Физика", "oge", [2, 2, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 2, 3, 2, 2, 3, 3, 3]),
    (
        "Русский язык",
        "ege",
        [1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 22],
    ),
    ("Русский язык", "oge", [6, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 7, 3, 3, 3, 3, 1]),
    (
        "Обществознание",
        "ege",
        [1, 2, 1, 2, 2, 2, 2, 2, 1, 2, 2, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 4, 3, 4, 6],
    ),
    (
        "Обществознание",
        "oge",
        [2, 1, 1, 1, 3, 2, 1, 1, 1, 1, 1, 4, 1, 1, 2, 1, 1, 1, 1, 1, 2, 2, 3, 2],
    ),
]


def _tasks(scores):
    return [
        {"code": str(index), "title": f"Задание {index}", "max_score": score}
        for index, score in enumerate(scores, start=1)
    ]


def upgrade():
    connection = op.get_bind()
    subjects = sa.table(
        "subjects",
        sa.column("id", sa.Integer),
        sa.column("name", sa.String),
        sa.column("format", sa.String),
        sa.column("tasks", sa.JSON),
        sa.column("is_active", sa.Boolean),
    )
    existing = connection.execute(
        sa.select(subjects.c.id, subjects.c.name, subjects.c.format)
    ).mappings()
    by_key = {(row["name"].strip().casefold(), row["format"]): row["id"] for row in existing}
    for name, exam_format, scores in SUBJECTS:
        values = {"name": name, "format": exam_format, "tasks": _tasks(scores), "is_active": True}
        subject_id = by_key.get((name.casefold(), exam_format))
        if subject_id is None:
            connection.execute(subjects.insert().values(**values))
        else:
            connection.execute(
                subjects.update().where(subjects.c.id == subject_id).values(**values)
            )


def downgrade():
    # This data migration can update settings that existed before it. Removing
    # them on downgrade would destroy user data, so the downgrade is a no-op.
    pass
