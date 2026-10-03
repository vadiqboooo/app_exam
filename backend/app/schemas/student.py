from datetime import UTC, datetime

from pydantic import field_validator

from app.schemas.base import Schema


class StudentRead(Schema):
    id: int
    external_id: str | None
    full_name: str
    name_key: str
    grade: int | None
    is_active: bool
    has_code: bool = False
    locked_until: datetime | None = None
    last_login_at: datetime | None = None

    @field_validator("locked_until", "last_login_at")
    @classmethod
    def utc_time(cls, value):
        return value.replace(tzinfo=UTC) if value is not None else None
