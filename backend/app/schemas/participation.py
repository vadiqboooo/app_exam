from datetime import UTC, datetime
from typing import Literal

from pydantic import Field, field_validator, model_validator

from app.schemas.base import NonEmpty, Schema, Score


class Registration(Schema):
    student_id: int = Field(gt=0)
    exam_id: int = Field(gt=0)
    slot_id: int | None = Field(default=None, gt=0)


class StatusChange(Schema):
    status: Literal[
        "registered", "attended", "submitted", "checked", "published", "absent", "cancelled"
    ]


class TaskResult(Schema):
    code: NonEmpty
    score: Score
    comment: str = ""


class ResultData(Schema):
    version: Literal[1] = 1
    tasks: list[TaskResult]
    overall_comment: str = ""

    @model_validator(mode="after")
    def unique_codes(self):
        if len({t.code for t in self.tasks}) != len(self.tasks):
            raise ValueError("Коды заданий должны быть уникальными")
        return self


class ResultWrite(Schema):
    primary_score: Score
    test_score: Score | None = None
    result_data: ResultData | None = None


class QuickResultWrite(ResultWrite):
    """Operator entry of a result without walking through every attendance status."""

    student_id: int = Field(gt=0)
    exam_id: int = Field(gt=0)
    slot_id: int | None = Field(default=None, gt=0)


class ParticipationRead(Schema):
    id: int
    student_id: int
    exam_id: int
    slot_id: int | None
    status: str
    primary_score: float | None
    test_score: float | None
    result_data: ResultData | None
    updated_at: datetime
    published_at: datetime | None
    checked_by: str | None = None

    @field_validator("updated_at", "published_at")
    @classmethod
    def utc_time(cls, value):
        return value.replace(tzinfo=UTC) if value is not None else None


class ParticipationStaffRead(ParticipationRead):
    """What staff see; the student's own screens never get the note for the parent."""

    feedback: str | None = None
    parent_status: Literal["none", "sent", "got"] = "none"


class FeedbackWrite(Schema):
    participation_ids: list[int] = Field(min_length=1)
    feedback: str | None = Field(default=None, max_length=4000)
    parent_status: Literal["none", "sent", "got"] | None = None
