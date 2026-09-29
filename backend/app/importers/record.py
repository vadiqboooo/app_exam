from pydantic import Field, field_validator

from app.schemas.base import NonEmpty, Schema


def normalize_name(value: str) -> str:
    return " ".join(value.split()).casefold()


class StudentRecord(Schema):
    full_name: NonEmpty
    external_id: NonEmpty | None = None
    grade: int | None = Field(default=None, ge=1, le=11)
    is_active: bool = True
    groups: tuple[NonEmpty, ...] = ()

    @field_validator("full_name")
    @classmethod
    def clean_name(cls, value):
        return " ".join(value.split())

    @field_validator("groups")
    @classmethod
    def unique_groups(cls, value):
        return tuple(sorted(set(value)))
