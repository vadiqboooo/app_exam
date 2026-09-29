from datetime import datetime

from sqlalchemy import JSON, CheckConstraint, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Exam(Base):
    __tablename__ = "exams"
    __table_args__ = (
        CheckConstraint("type IN ('mock', 'ege')", name="type"),
        CheckConstraint("ends_at >= starts_at", name="date_order"),
        CheckConstraint("registration_close_at >= registration_open_at", name="registration_order"),
        CheckConstraint("format IN ('ege', 'oge')", name="format"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int | None] = mapped_column(ForeignKey("exam_events.id"), index=True)
    format: Mapped[str | None]
    type: Mapped[str] = mapped_column(index=True)
    subject: Mapped[str] = mapped_column(index=True)
    title: Mapped[str | None]
    wave: Mapped[str | None] = mapped_column(index=True)
    starts_at: Mapped[datetime] = mapped_column(index=True)
    ends_at: Mapped[datetime | None]
    registration_open_at: Mapped[datetime | None]
    registration_close_at: Mapped[datetime | None]
    structure_data: Mapped[dict | None] = mapped_column(JSON)
    is_active: Mapped[bool] = mapped_column(default=True)
