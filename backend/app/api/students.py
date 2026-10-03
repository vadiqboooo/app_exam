from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.api.dependencies import (
    Limit,
    Offset,
    ReadSession,
    WriteSession,
    get_or_404,
    require_admin,
    teacher_id,
)
from app.importers.record import normalize_name
from app.models import Membership, Student, StudyGroup
from app.schemas.student import StudentRead
from app.services.access_code import reset_code, unlock

router = APIRouter(prefix="/students", tags=["students"])


@router.get("", response_model=list[StudentRead])
def list_students(
    session: ReadSession,
    active: bool | None = None,
    search: str = "",
    limit: Limit = 100,
    offset: Offset = 0,
    current_teacher_id: int | None = Depends(teacher_id),
):
    query = select(Student).order_by(Student.id)
    if current_teacher_id is not None:
        query = (
            query.join(Membership)
            .join(StudyGroup)
            .where(
                Membership.ended_at.is_(None),
                StudyGroup.teacher_id == current_teacher_id,
            )
            .distinct()
        )
    if active is not None:
        query = query.where(Student.is_active == active)
    if search:
        query = query.where(Student.name_key.contains(normalize_name(search), autoescape=True))
    return session.scalars(query.limit(limit).offset(offset)).all()


@router.get("/{student_id}", response_model=StudentRead)
def get_student(
    student_id: int,
    session: ReadSession,
    current_teacher_id: int | None = Depends(teacher_id),
):
    student = get_or_404(session, Student, student_id)
    if current_teacher_id is not None:
        own_student = session.scalar(
            select(Membership.id)
            .join(StudyGroup)
            .where(
                Membership.student_id == student_id,
                Membership.ended_at.is_(None),
                StudyGroup.teacher_id == current_teacher_id,
            )
        )
        if own_student is None:
            raise HTTPException(404, "Ученик не относится к вашим группам")
    return student


@router.get("/{student_id}/memberships")
def memberships(
    student_id: int,
    session: ReadSession,
    limit: Limit = 100,
    offset: Offset = 0,
    current_teacher_id: int | None = Depends(teacher_id),
):
    get_student(student_id, session, current_teacher_id)
    query = select(Membership).where(Membership.student_id == student_id)
    if current_teacher_id is not None:
        query = query.join(StudyGroup).where(StudyGroup.teacher_id == current_teacher_id)
    return session.scalars(query.order_by(Membership.id).limit(limit).offset(offset)).all()


@router.post(
    "/{student_id}/reset-code",
    response_model=StudentRead,
    dependencies=[Depends(require_admin)],
)
def reset_student_code(student_id: int, session: WriteSession):
    student = get_or_404(session, Student, student_id)
    reset_code(student)
    return student


@router.post(
    "/{student_id}/unlock",
    response_model=StudentRead,
    dependencies=[Depends(require_admin)],
)
def unlock_student(student_id: int, session: WriteSession):
    student = get_or_404(session, Student, student_id)
    unlock(student)
    return student
