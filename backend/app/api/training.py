from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies import ReadSession, WriteSession, staff_id
from app.models import Staff

router = APIRouter(prefix="/training", tags=["training"])

Part = Literal["groups", "outside"]


def _utc(value):
    return value.replace(tzinfo=UTC) if value is not None else None


def _read(staff: Staff) -> dict:
    return {
        "groups_at": _utc(staff.training_groups_at),
        "outside_at": _utc(staff.training_outside_at),
    }


def _me(session, current_staff_id: int | None) -> Staff:
    staff = session.get(Staff, current_staff_id) if current_staff_id is not None else None
    if staff is None:
        raise HTTPException(404, "Обучение доступно сотрудникам с личным входом")
    return staff


@router.get("")
def my_training(session: ReadSession, current_staff_id: int | None = Depends(staff_id)):
    if current_staff_id is None:
        return {"groups_at": None, "outside_at": None}
    return _read(_me(session, current_staff_id))


@router.post("/{part}")
def finish_part(
    part: Part, session: WriteSession, current_staff_id: int | None = Depends(staff_id)
):
    staff = _me(session, current_staff_id)
    now = datetime.now(UTC).replace(tzinfo=None)
    # Passing a part again keeps the first date.
    if part == "groups":
        staff.training_groups_at = staff.training_groups_at or now
    else:
        staff.training_outside_at = staff.training_outside_at or now
    session.flush()
    return _read(staff)
