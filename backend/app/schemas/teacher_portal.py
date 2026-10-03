from pydantic import Field, field_validator

from app.schemas.base import NonEmpty, Schema


class TeacherLogin(Schema):
    first_name: NonEmpty
    middle_name: NonEmpty


class TeacherCodeLogin(TeacherLogin):
    code: str | None = None


class TeacherWrite(TeacherLogin):
    group_ids: list[int] = Field(default_factory=list)

    @field_validator("group_ids")
    @classmethod
    def valid_group_ids(cls, value):
        if any(group_id <= 0 for group_id in value):
            raise ValueError("ID группы должен быть положительным")
        return sorted(set(value))
