from pydantic import Field

from app.schemas.base import NonEmpty, Schema


class StudentLogin(Schema):
    last_name: NonEmpty
    first_name: NonEmpty
    code: str | None = None


class StudentSignup(Schema):
    last_name: NonEmpty
    first_name: NonEmpty
    code: str = Field(pattern=r"^\d{6}$")
    phone: str = Field(min_length=10, max_length=24)


class StudentParticipation(Schema):
    id: int
    exam_id: int
    slot_id: int | None
    status: str


class StudentRegistration(Schema):
    slot_id: int | None = Field(default=None, gt=0)
