from sqlalchemy import JSON, CheckConstraint, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class StudyGroup(Base):
    __tablename__ = "study_groups"
    __table_args__ = (CheckConstraint("exam_format IN ('ege', 'oge')", name="exam_format"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    source_name: Mapped[str] = mapped_column(unique=True)
    subject: Mapped[str | None]
    exam_format: Mapped[str | None]
    teacher_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id"))
    is_active: Mapped[bool] = mapped_column(default=True)


class GroupCoverage(Base):
    """Tasks of an exam that the group has already covered in class (one row per group and exam)."""

    __tablename__ = "group_coverage"

    group_id: Mapped[int] = mapped_column(ForeignKey("study_groups.id"), primary_key=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id"), primary_key=True, index=True)
    task_codes: Mapped[list] = mapped_column(JSON, default=list)
