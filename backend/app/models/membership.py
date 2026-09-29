from datetime import date

from sqlalchemy import CheckConstraint, ForeignKey, Index, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (
        CheckConstraint("ended_at >= started_at", name="date_order"),
        Index(
            "uq_memberships_active",
            "student_id",
            "group_id",
            unique=True,
            sqlite_where=text("ended_at IS NULL"),
            postgresql_where=text("ended_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), index=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("study_groups.id"), index=True)
    started_at: Mapped[date]
    ended_at: Mapped[date | None] = mapped_column(index=True)
