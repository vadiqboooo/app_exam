from datetime import datetime

from sqlalchemy import CheckConstraint, false
from sqlalchemy.orm import Mapped, mapped_column

from app.models.access import AccessCodeMixin
from app.models.base import Base


class Student(AccessCodeMixin, Base):
    __tablename__ = "students"
    __table_args__ = (CheckConstraint("grade BETWEEN 1 AND 11", name="grade_range"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    external_id: Mapped[str | None] = mapped_column(unique=True, index=True)
    full_name: Mapped[str]
    name_key: Mapped[str] = mapped_column(index=True)
    grade: Mapped[int | None]
    is_active: Mapped[bool] = mapped_column(default=True)
    phone: Mapped[str | None]
    # The school the pupil attends (set per file when a group roster is imported).
    school: Mapped[str | None]
    # Signed up on the site (not from the school roster): imports never archive them.
    self_registered: Mapped[bool] = mapped_column(default=False, server_default=false())
    # Waiting for an administrator to confirm the application; cannot log in yet.
    is_pending: Mapped[bool] = mapped_column(default=False, server_default=false())
    requested_at: Mapped[datetime | None]
