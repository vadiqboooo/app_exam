from app.schemas.base import Schema


class StudentRead(Schema):
    id: int
    external_id: str | None
    full_name: str
    name_key: str
    grade: int | None
    is_active: bool
