from typing import Literal

from pydantic import Field, model_validator

from app.schemas.base import NonEmpty, Schema
from app.schemas.exam import GradeRange, Task


class SubjectWrite(Schema):
    name: NonEmpty
    format: Literal["ege", "oge"]
    tasks: list[Task] = Field(default_factory=list)
    primary_to_secondary_scale: list[int] | None = None
    grade_scale: list[GradeRange] | None = None
    is_active: bool = True

    @model_validator(mode="after")
    def positive_maxima(self):
        if any(task.max_score <= 0 for task in self.tasks):
            raise ValueError("Максимальный балл задания должен быть больше нуля")
        if self.primary_to_secondary_scale and any(
            score < 0 for score in self.primary_to_secondary_scale
        ):
            raise ValueError("Баллы шкалы не могут быть отрицательными")
        return self


class SubjectRead(SubjectWrite):
    id: int
    max_primary_score: float
