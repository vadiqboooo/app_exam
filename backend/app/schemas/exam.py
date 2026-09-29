from datetime import UTC, datetime
from typing import Literal

from pydantic import Field, field_validator, model_validator

from app.schemas.base import NonEmpty, Schema, Score


class Task(Schema):
    code: NonEmpty
    title: NonEmpty
    max_score: Score


class GradeRange(Schema):
    grade: int = Field(ge=2, le=5)
    min: int = Field(ge=0)
    max: int = Field(ge=0)

    @model_validator(mode="after")
    def ordered(self):
        if self.max < self.min:
            raise ValueError("Максимум диапазона оценки меньше минимума")
        return self


class Structure(Schema):
    version: Literal[1] = 1
    tasks: list[Task]
    primary_to_secondary_scale: list[int] | None = None
    grade_scale: list[GradeRange] | None = None

    @model_validator(mode="after")
    def unique_codes(self):
        if len({t.code for t in self.tasks}) != len(self.tasks):
            raise ValueError("Коды заданий должны быть уникальными")
        return self


class ExamCreate(Schema):
    type: Literal["mock", "ege"]
    subject: NonEmpty
    title: str | None = None
    wave: str | None = None
    starts_at: datetime
    ends_at: datetime | None = None
    registration_open_at: datetime | None = None
    registration_close_at: datetime | None = None
    structure_data: Structure | None = None
    is_active: bool = True

    @field_validator("starts_at", "ends_at", "registration_open_at", "registration_close_at")
    @classmethod
    def utc_time(cls, value):
        if value is not None:
            if value.tzinfo is None:
                raise ValueError("Укажите часовой пояс, например +08:00 или Z")
            return value.astimezone(UTC)
        return value

    @model_validator(mode="after")
    def date_order(self):
        if self.ends_at and self.ends_at < self.starts_at:
            raise ValueError("Окончание раньше начала экзамена")
        if (
            self.registration_open_at
            and self.registration_close_at
            and self.registration_close_at < self.registration_open_at
        ):
            raise ValueError("Окончание записи раньше её начала")
        return self


class SlotRead(Schema):
    id: int
    school_id: int
    school_name: str
    school_address: str | None
    starts_at: datetime
    capacity: int
    booked: int
    remaining: int

    @field_validator("starts_at")
    @classmethod
    def utc_time(cls, value):
        return value.replace(tzinfo=UTC)


class ExamRead(Schema):
    id: int
    event_id: int | None = None
    format: str | None = None
    slots: list[SlotRead] = Field(default_factory=list)
    type: str
    subject: str
    title: str | None
    wave: str | None
    starts_at: datetime
    ends_at: datetime | None
    registration_open_at: datetime | None
    registration_close_at: datetime | None
    structure_data: Structure | None
    is_active: bool

    @field_validator("starts_at", "ends_at", "registration_open_at", "registration_close_at")
    @classmethod
    def utc_time(cls, value):
        return value.replace(tzinfo=UTC) if value is not None else None
