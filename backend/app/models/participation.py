from datetime import datetime

from sqlalchemy import JSON, CheckConstraint, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.time import utcnow


class Participation(Base):
    __tablename__ = "participations"
    __table_args__ = (
        UniqueConstraint("student_id", "exam_id"),
        CheckConstraint(
            "status IN ('registered', 'attended', 'submitted', 'checked', "
            "'published', 'absent', 'cancelled')",
            name="status",
        ),
        CheckConstraint("primary_score >= 0", name="primary_score"),
        CheckConstraint("test_score >= 0", name="test_score"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), index=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id"), index=True)
    slot_id: Mapped[int | None] = mapped_column(ForeignKey("exam_slots.id"), index=True)
    status: Mapped[str] = mapped_column(default="registered", index=True)
    primary_score: Mapped[float | None]
    test_score: Mapped[float | None]
    result_data: Mapped[dict | None] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)
    published_at: Mapped[datetime | None]
    # Name snapshot of whoever last entered or changed the scores.
    checked_by: Mapped[str | None]
    # What to tell the student and the parent about this exam, and how far the message got.
    feedback: Mapped[str | None]
    parent_status: Mapped[str] = mapped_column(default="none", server_default="none")
