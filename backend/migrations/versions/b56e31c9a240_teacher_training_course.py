"""Editable teacher training topics, questions, attempts and progress."""

import sqlalchemy as sa
from alembic import op

revision = "b56e31c9a240"
down_revision = "a98c5f7d2e40"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "training_topics",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False, server_default=""),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("video_url", sa.String(), nullable=True),
        sa.Column("material_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("published", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("pass_percent", sa.Integer(), nullable=False, server_default="80"),
    )
    op.create_table(
        "training_questions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("topic_id", sa.Integer(), sa.ForeignKey("training_topics.id", ondelete="CASCADE"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("prompt", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("options", sa.JSON(), nullable=False),
        sa.Column("answer", sa.JSON(), nullable=False),
    )
    op.create_table(
        "training_progress",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("staff_id", sa.Integer(), sa.ForeignKey("staff.id", ondelete="CASCADE"), nullable=False),
        sa.Column("topic_id", sa.Integer(), sa.ForeignKey("training_topics.id", ondelete="CASCADE"), nullable=False),
        sa.Column("video_percent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("material_read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("best_score", sa.Integer(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("staff_id", "topic_id"),
    )
    op.create_table(
        "training_attempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("staff_id", sa.Integer(), sa.ForeignKey("staff.id", ondelete="CASCADE"), nullable=False),
        sa.Column("topic_id", sa.Integer(), sa.ForeignKey("training_topics.id", ondelete="CASCADE"), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("total", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    names = [
        "Пробный урок",
        "Заполнение CRM системы",
        "Взаимодействие с администрацией",
        "Сложные ситуации",
        "Стандарт домашнего задания",
        "Построение урока на 90 минут",
        "Построение урока на 180 минут",
    ]
    topics = sa.table(
        "training_topics",
        sa.column("title", sa.String()),
        sa.column("description", sa.String()),
        sa.column("position", sa.Integer()),
        sa.column("material_text", sa.Text()),
        sa.column("published", sa.Boolean()),
        sa.column("pass_percent", sa.Integer()),
    )
    material = (
        "Подготовьтесь к пробному уроку: уточните класс, предмет и цель ученика.\n\n"
        "Познакомьтесь с учеником и спросите, какие темы вызывают трудности.\n\n"
        "Проведите короткую диагностику: предложите несколько заданий и попросите объяснить решение.\n\n"
        "В конце назовите сильные стороны, обозначьте пробелы и договоритесь о следующем шаге."
    )
    op.bulk_insert(topics, [dict(
        title=name,
        description="Подготовка, знакомство с учеником, диагностика и обратная связь." if i == 0 else "",
        position=i + 1,
        material_text=material if i == 0 else "",
        published=i == 0,
        pass_percent=80,
    ) for i, name in enumerate(names)])
    first_id = op.get_bind().execute(sa.text("SELECT id FROM training_topics WHERE position = 1")).scalar_one()
    questions = sa.table(
        "training_questions",
        sa.column("topic_id", sa.Integer()),
        sa.column("position", sa.Integer()),
        sa.column("prompt", sa.String()),
        sa.column("kind", sa.String()),
        sa.column("options", sa.JSON()),
        sa.column("answer", sa.JSON()),
    )
    samples = [
        ("С чего стоит начать пробный урок?", ["Уточнить цель ученика и познакомиться", "Сразу дать контрольную", "Начать с домашнего задания"], [0]),
        ("Что помогает оценить стартовый уровень?", ["Только школьная отметка", "Короткие задания и обсуждение решения", "Количество занятий в неделю"], [1]),
        ("Что полезно обсудить после диагностики?", ["Только число ошибок", "Только правила школы", "Сильные стороны, пробелы и следующий шаг"], [2]),
        ("Как подобрать сложность первого задания?", ["Опираться на цель и ответы ученика", "Выбрать самое сложное", "Дать одинаковое задание всем"], [0]),
        ("Чем завершить пробный урок?", ["Выдать весь список тем за год", "Подвести итоги и согласовать следующий шаг", "Закрыть встречу без обратной связи"], [1]),
    ]
    op.bulk_insert(questions, [dict(topic_id=first_id, position=i, prompt=prompt, kind="single", options=options, answer=answer) for i, (prompt, options, answer) in enumerate(samples)])


def downgrade():
    op.drop_table("training_attempts")
    op.drop_table("training_progress")
    op.drop_table("training_questions")
    op.drop_table("training_topics")
