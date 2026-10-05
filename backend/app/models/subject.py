from datetime import datetime

from sqlalchemy import JSON, CheckConstraint, ForeignKey, LargeBinary, UniqueConstraint
from sqlalchemy.orm import Mapped, deferred, mapped_column

from app.models.base import Base
from app.time import utcnow


class Subject(Base):
    __tablename__ = "subjects"
    __table_args__ = (
        CheckConstraint("format IN ('ege', 'oge')", name="format"),
        UniqueConstraint("name", "format"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    format: Mapped[str]
    tasks: Mapped[list] = mapped_column(JSON, default=list)
    primary_to_secondary_scale: Mapped[list | None] = mapped_column(JSON)
    grade_scale: Mapped[list | None] = mapped_column(JSON)
    is_active: Mapped[bool] = mapped_column(default=True)
    duration_minutes: Mapped[int | None]
    # The teacher who maintains the subject (tasks, scale, printable variants).
    responsible_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id"), index=True)
    responsible_since: Mapped[datetime | None]


class SubjectVariant(Base):
    """A printable exam variant (PDF or Word) uploaded by the responsible teacher."""

    __tablename__ = "subject_variants"

    id: Mapped[int] = mapped_column(primary_key=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"), index=True)
    name: Mapped[str]
    filename: Mapped[str]
    content_type: Mapped[str]
    size: Mapped[int]
    uploaded_at: Mapped[datetime] = mapped_column(default=utcnow)
    # Kept in the database so a backup of the database is a backup of the files.
    data: Mapped[bytes] = deferred(mapped_column(LargeBinary, nullable=False))


class VariantEvent(Base):
    """A variant is printed for every exam event it is attached to (many to many)."""

    __tablename__ = "variant_events"

    variant_id: Mapped[int] = mapped_column(ForeignKey("subject_variants.id"), primary_key=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("exam_events.id"), primary_key=True, index=True
    )
