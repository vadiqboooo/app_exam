from datetime import UTC, datetime
from typing import Literal

from pydantic import Field, field_validator, model_validator

from app.schemas.base import NonEmpty, Schema
from app.schemas.exam import Structure


class SchoolCreate(Schema):
    id: int | None = Field(default=None, gt=0)
    name: NonEmpty
    address: str | None = None
    slots: list["SlotCreate"] = Field(min_length=1)


class SlotCreate(Schema):
    id: int | None = Field(default=None, gt=0)
    starts_at: datetime
    capacity: int = Field(gt=0, strict=True)

    @field_validator("starts_at")
    @classmethod
    def utc_time(cls, value):
        if value.tzinfo is None:
            raise ValueError("Укажите часовой пояс времени записи")
        return value.astimezone(UTC)


class SubjectCreate(Schema):
    id: int | None = Field(default=None, gt=0)
    format: Literal["ege", "oge"]
    subject: NonEmpty
    structure_data: Structure | None = None


class EventCreate(Schema):
    title: NonEmpty
    schools: list[SchoolCreate] = Field(min_length=1)
    subjects: list[SubjectCreate] = Field(min_length=1)
    registration_open_at: datetime | None = None
    registration_close_at: datetime | None = None

    @field_validator("registration_open_at", "registration_close_at")
    @classmethod
    def utc_time(cls, value):
        if value is not None:
            if value.tzinfo is None:
                raise ValueError("Укажите часовой пояс периода регистрации")
            return value.astimezone(UTC)
        return value

    @model_validator(mode="after")
    def validate_schedule(self):
        names = {s.name.casefold() for s in self.schools}
        if len(names) != len(self.schools):
            raise ValueError("Названия школ не должны повторяться")
        subjects = {(s.format, s.subject.casefold()) for s in self.subjects}
        if len(subjects) != len(self.subjects):
            raise ValueError("Предмет не должен повторяться в одном формате")
        for school in self.schools:
            starts = [slot.starts_at for slot in school.slots]
            if len(set(starts)) != len(starts):
                raise ValueError("Время в одной школе не должно повторяться")
        if (
            self.registration_open_at
            and self.registration_close_at
            and self.registration_close_at <= self.registration_open_at
        ):
            raise ValueError("Конец регистрации должен быть позже начала")
        last_start = max(slot.starts_at for school in self.schools for slot in school.slots)
        if self.registration_open_at and self.registration_open_at >= last_start:
            raise ValueError("Регистрация должна открыться до проведения пробника")
        return self


class EventRead(Schema):
    id: int
    title: str
    exam_ids: list[int]
