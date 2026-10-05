from datetime import UTC, datetime
from typing import Literal

from pydantic import Field, field_validator, model_validator

from app.schemas.base import NonEmpty, Schema
from app.schemas.exam import GradeRange, Task


class SubjectContentWrite(Schema):
    """What the responsible teacher may change: tasks and the score scales."""

    tasks: list[Task] = Field(default_factory=list)
    primary_to_secondary_scale: list[int] | None = None
    grade_scale: list[GradeRange] | None = None

    @model_validator(mode="after")
    def positive_maxima(self):
        if any(task.max_score <= 0 for task in self.tasks):
            raise ValueError("Максимальный балл задания должен быть больше нуля")
        if self.primary_to_secondary_scale and any(
            score < 0 for score in self.primary_to_secondary_scale
        ):
            raise ValueError("Баллы шкалы не могут быть отрицательными")
        return self


class SubjectWrite(SubjectContentWrite):
    name: NonEmpty
    format: Literal["ege", "oge"]
    is_active: bool = True
    duration_minutes: int | None = Field(default=None, ge=1, le=1000)
    responsible_id: int | None = None


class SubjectRead(SubjectWrite):
    id: int
    max_primary_score: float
    responsible_name: str | None = None
    responsible_since: datetime | None = None
    variants_count: int = 0

    @field_validator("responsible_since")
    @classmethod
    def utc_time(cls, value):
        return value.replace(tzinfo=UTC) if value is not None else None


class VariantRead(Schema):
    id: int
    subject_id: int
    name: str
    filename: str
    content_type: str
    size: int
    uploaded_at: datetime
    event_ids: list[int] = []

    @field_validator("uploaded_at")
    @classmethod
    def utc_time(cls, value):
        return value.replace(tzinfo=UTC)


class VariantRename(Schema):
    name: NonEmpty


class VariantEvents(Schema):
    event_ids: list[int]
