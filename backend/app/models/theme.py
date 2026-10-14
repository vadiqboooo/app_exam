from sqlalchemy import true
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ThemeSetting(Base):
    __tablename__ = "theme_settings"

    key: Mapped[str] = mapped_column(primary_key=True)
    title: Mapped[str]
    is_enabled: Mapped[bool] = mapped_column(default=True, server_default=true())
