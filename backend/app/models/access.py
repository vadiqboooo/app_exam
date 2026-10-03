from datetime import datetime

from sqlalchemy.orm import Mapped, mapped_column


class AccessCodeMixin:
    """Личный 6-значный код входа и состояние блокировки после неверных попыток."""

    access_code_hash: Mapped[str | None]
    failed_attempts: Mapped[int] = mapped_column(default=0, server_default="0")
    lock_level: Mapped[int] = mapped_column(default=0, server_default="0")
    locked_until: Mapped[datetime | None]
    last_login_at: Mapped[datetime | None]

    @property
    def has_code(self) -> bool:
        return self.access_code_hash is not None
