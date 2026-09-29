from pydantic import Field

from app.schemas.base import NonEmpty, Schema


class StudentLogin(Schema):
    last_name: NonEmpty
    first_name: NonEmpty


class StudentParticipation(Schema):
    id: int
    exam_id: int
    slot_id: int | None
    status: str


class StudentRegistration(Schema):
    slot_id: int | None = Field(default=None, gt=0)
