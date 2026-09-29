from sqlalchemy import CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Student(Base):
    __tablename__ = "students"
    __table_args__ = (CheckConstraint("grade BETWEEN 1 AND 11", name="grade_range"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    external_id: Mapped[str | None] = mapped_column(unique=True, index=True)
    full_name: Mapped[str]
    name_key: Mapped[str] = mapped_column(index=True)
    grade: Mapped[int | None]
    is_active: Mapped[bool] = mapped_column(default=True)
    access_code_hash: Mapped[str | None]
