from sqlalchemy import CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.access import AccessCodeMixin
from app.models.base import Base


class Staff(AccessCodeMixin, Base):
    __tablename__ = "staff"
    __table_args__ = (CheckConstraint("role IN ('admin', 'responsible', 'teacher')", name="role"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    login: Mapped[str] = mapped_column(unique=True)
    password_hash: Mapped[str]
    role: Mapped[str]
