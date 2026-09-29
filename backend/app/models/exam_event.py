from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ExamEvent(Base):
    __tablename__ = "exam_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str]


class ExamSchool(Base):
    __tablename__ = "exam_schools"
    __table_args__ = (UniqueConstraint("event_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("exam_events.id"), index=True)
    name: Mapped[str]
    address: Mapped[str | None]


class ExamSlot(Base):
    __tablename__ = "exam_slots"
    __table_args__ = (
        # The former uniqueness rule is retained for a migration that does not
        # rebuild this referenced table on SQLite.
        UniqueConstraint("exam_id", "school_id", "starts_at"),
        Index(
            "ux_exam_slots_event_school_start",
            "event_id",
            "school_id",
            "starts_at",
            unique=True,
        ),
        CheckConstraint("capacity > 0", name="capacity"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int | None] = mapped_column(ForeignKey("exam_events.id"), index=True)
    # Kept as an internal owner for backwards-compatible database migration. Slots are
    # exposed and validated by event_id and are shared by every subject in the event.
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id"), index=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("exam_schools.id"), index=True)
    starts_at: Mapped[datetime] = mapped_column(index=True)
    capacity: Mapped[int]
