from datetime import datetime

from sqlalchemy import ForeignKey, JSON, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class TrainingTopic(Base):
    __tablename__ = "training_topics"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str]
    description: Mapped[str] = mapped_column(default="")
    position: Mapped[int] = mapped_column(default=0)
    video_url: Mapped[str | None]
    material_text: Mapped[str] = mapped_column(Text, default="")
    published: Mapped[bool] = mapped_column(default=False)
    pass_percent: Mapped[int] = mapped_column(default=80)


class TrainingQuestion(Base):
    __tablename__ = "training_questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    topic_id: Mapped[int] = mapped_column(ForeignKey("training_topics.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(default=0)
    prompt: Mapped[str]
    kind: Mapped[str]
    options: Mapped[list] = mapped_column(JSON, default=list)
    answer: Mapped[list | str] = mapped_column(JSON)


class TrainingProgress(Base):
    __tablename__ = "training_progress"
    __table_args__ = (UniqueConstraint("staff_id", "topic_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    staff_id: Mapped[int] = mapped_column(ForeignKey("staff.id", ondelete="CASCADE"))
    topic_id: Mapped[int] = mapped_column(ForeignKey("training_topics.id", ondelete="CASCADE"))
    video_percent: Mapped[int] = mapped_column(default=0)
    video_position_seconds: Mapped[int] = mapped_column(default=0)
    material_read: Mapped[bool] = mapped_column(default=False)
    best_score: Mapped[int | None]
    completed_at: Mapped[datetime | None]


class TrainingAttempt(Base):
    __tablename__ = "training_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    staff_id: Mapped[int] = mapped_column(ForeignKey("staff.id", ondelete="CASCADE"))
    topic_id: Mapped[int] = mapped_column(ForeignKey("training_topics.id", ondelete="CASCADE"))
    score: Mapped[int]
    total: Mapped[int]
    created_at: Mapped[datetime]
