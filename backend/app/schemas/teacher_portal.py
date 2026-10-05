from typing import Literal

from pydantic import Field, field_validator

from app.schemas.base import NonEmpty, Schema

Role = Literal["admin", "responsible", "teacher"]


def _at_least_one_role(value: list[str]) -> list[str]:
    if not value:
        raise ValueError("У сотрудника должна быть хотя бы одна роль")
    return sorted(set(value))


class TeacherLogin(Schema):
    first_name: NonEmpty
    middle_name: NonEmpty


class TeacherCodeLogin(TeacherLogin):
    code: str | None = None


class TeacherWrite(TeacherLogin):
    group_ids: list[int] = Field(default_factory=list)
    roles: list[Role] = Field(default_factory=lambda: ["teacher"])

    @field_validator("group_ids")
    @classmethod
    def valid_group_ids(cls, value):
        if any(group_id <= 0 for group_id in value):
            raise ValueError("ID группы должен быть положительным")
        return sorted(set(value))

    @field_validator("roles")
    @classmethod
    def valid_roles(cls, value):
        return _at_least_one_role(value)


class StaffRoles(Schema):
    roles: list[Role]

    @field_validator("roles")
    @classmethod
    def valid_roles(cls, value):
        return _at_least_one_role(value)
