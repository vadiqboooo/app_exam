from sqlalchemy import JSON, CheckConstraint, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


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
