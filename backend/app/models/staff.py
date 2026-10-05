from sqlalchemy import CheckConstraint, false, true
from sqlalchemy.orm import Mapped, mapped_column

from app.models.access import AccessCodeMixin
from app.models.base import Base

ROLES = ("admin", "responsible", "teacher")


class Staff(AccessCodeMixin, Base):
    __tablename__ = "staff"
    __table_args__ = (CheckConstraint("role IN ('admin', 'responsible', 'teacher')", name="role"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    login: Mapped[str] = mapped_column(unique=True)
    password_hash: Mapped[str]
    # Legacy column: every employee is stored as «teacher»; the real roles are the flags below.
    role: Mapped[str]
    is_teacher: Mapped[bool] = mapped_column(default=True, server_default=true())
    is_admin: Mapped[bool] = mapped_column(default=False, server_default=false())
    is_responsible: Mapped[bool] = mapped_column(default=False, server_default=false())

    @property
    def roles(self) -> list[str]:
        flags = {
            "admin": self.is_admin,
            "responsible": self.is_responsible,
            "teacher": self.is_teacher,
        }
        return [role for role in ROLES if flags[role]]
