from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import exists, select

from app.api.dependencies import Limit, Offset, ReadSession, WriteSession, get_or_404, teacher_id
from app.models import Membership, Participation, Staff, StudyGroup
from app.schemas.participation import (
    ParticipationRead,
    QuickResultWrite,
    Registration,
    ResultWrite,
    StatusChange,
)
from app.services.participation import change_status, quick_save_result, register, save_result

router = APIRouter(prefix="/participations", tags=["participations"])


def checker_name(session, current_teacher_id: int | None) -> str:
    teacher = session.get(Staff, current_teacher_id) if current_teacher_id is not None else None
    return teacher.name if teacher else "Администратор"


def require_teacher_student(session, student_id: int, current_teacher_id: int | None) -> None:
    if current_teacher_id is None:
        return
    allowed = session.scalar(
        select(
            exists().where(
                Membership.student_id == student_id,
                Membership.ended_at.is_(None),
                Membership.group_id == StudyGroup.id,
                StudyGroup.teacher_id == current_teacher_id,
            )
        )
    )
    if not allowed:
        raise HTTPException(404, "Ученик не относится к вашим группам")


@router.post("", response_model=ParticipationRead, status_code=201)
def create_participation(
    data: Registration,
    session: WriteSession,
    current_teacher_id: int | None = Depends(teacher_id),
):
    require_teacher_student(session, data.student_id, current_teacher_id)
    return register(session, data)


@router.get("", response_model=list[ParticipationRead])
def list_participations(
    session: ReadSession,
    student_id: int | None = None,
    exam_id: int | None = None,
    limit: Limit = 100,
    offset: Offset = 0,
    current_teacher_id: int | None = Depends(teacher_id),
):
    query = select(Participation).order_by(Participation.id)
    if current_teacher_id is not None:
        own_students = (
            select(Membership.student_id)
            .join(StudyGroup)
            .where(
                Membership.ended_at.is_(None),
                StudyGroup.teacher_id == current_teacher_id,
            )
        )
        query = query.where(Participation.student_id.in_(own_students))
    if student_id is not None:
        query = query.where(Participation.student_id == student_id)
    if exam_id is not None:
        query = query.where(Participation.exam_id == exam_id)
    return session.scalars(query.limit(limit).offset(offset)).all()


@router.post("/quick-result", response_model=ParticipationRead)
def create_or_update_quick_result(
    data: QuickResultWrite,
    session: WriteSession,
    current_teacher_id: int | None = Depends(teacher_id),
):
    require_teacher_student(session, data.student_id, current_teacher_id)
    return quick_save_result(session, data, checker_name(session, current_teacher_id))


@router.patch("/{participation_id}/status", response_model=ParticipationRead)
def update_status(
    participation_id: int,
    data: StatusChange,
    session: WriteSession,
    current_teacher_id: int | None = Depends(teacher_id),
):
    item = get_or_404(session, Participation, participation_id)
    require_teacher_student(session, item.student_id, current_teacher_id)
    change_status(item, data.status)
    session.flush()
    return item


@router.put("/{participation_id}/result", response_model=ParticipationRead)
def update_result(
    participation_id: int,
    data: ResultWrite,
    session: WriteSession,
    current_teacher_id: int | None = Depends(teacher_id),
):
    item = get_or_404(session, Participation, participation_id)
    require_teacher_student(session, item.student_id, current_teacher_id)
    save_result(session, item, data, checker_name(session, current_teacher_id))
    if item.status == "submitted":
        change_status(item, "checked")
    session.flush()
    return item


@router.post("/{participation_id}/publish", response_model=ParticipationRead)
def publish_result(
    participation_id: int,
    data: ResultWrite,
    session: WriteSession,
    current_teacher_id: int | None = Depends(teacher_id),
):
    item = get_or_404(session, Participation, participation_id)
    require_teacher_student(session, item.student_id, current_teacher_id)
    save_result(session, item, data, checker_name(session, current_teacher_id))
    if item.status == "submitted":
        change_status(item, "checked")
    change_status(item, "published")
    session.flush()
    return item
