from collections import defaultdict
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select

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
from app.models import Membership, Participation, Staff, Student, StudyGroup
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
        teacher = session.get(Staff, current_teacher_id)
        own = (
            select(Membership.student_id)
            .join(StudyGroup)
            .where(Membership.ended_at.is_(None), StudyGroup.teacher_id == current_teacher_id)
        )
        # Pupils of other groups whose work this teacher entered stay visible to them.
        checked = select(Participation.student_id).where(
            Participation.checked_by == (teacher.name if teacher else None)
        )
        query = query.where(or_(Student.id.in_(own), Student.id.in_(checked)))
    if active is not None:
        query = query.where(Student.is_active == active)
    if search:
        query = query.where(Student.name_key.contains(normalize_name(search), autoescape=True))
    return session.scalars(query.limit(limit).offset(offset)).all()


@router.get("/search")
def search_students(
    session: ReadSession,
    q: str = "",
    exam_id: int | None = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
):
    """Find any active pupil by name: a teacher may enter results for pupils of other groups.

    With ``exam_id`` every pupil also carries the status of their work on that exam.
    """
    words = [w.replace("ё", "е") for w in normalize_name(q).split()]
    if not words:
        return []
    name = func.replace(Student.name_key, "ё", "е")
    query = select(Student).where(Student.is_active.is_(True))
    for word in words:
        query = query.where(name.contains(word, autoescape=True))
    students = list(session.scalars(query.order_by(Student.full_name).limit(limit)))
    groups = defaultdict(list)
    rows = session.execute(
        select(Membership.student_id, StudyGroup.source_name, Staff.name)
        .join(StudyGroup, StudyGroup.id == Membership.group_id)
        .outerjoin(Staff, Staff.id == StudyGroup.teacher_id)
        .where(
            Membership.ended_at.is_(None),
            Membership.student_id.in_([s.id for s in students]),
        )
        .order_by(StudyGroup.source_name)
    )
    for student_id, source_name, teacher_name in rows:
        groups[student_id].append({"source_name": source_name, "teacher_name": teacher_name})
    statuses = {}
    if exam_id is not None and students:
        statuses = {
            student_id: status
            for student_id, status in session.execute(
                select(Participation.student_id, Participation.status).where(
                    Participation.exam_id == exam_id,
                    Participation.student_id.in_([s.id for s in students]),
                )
            )
        }
    return [
        {
            "id": s.id,
            "full_name": s.full_name,
            "grade": s.grade,
            "groups": groups[s.id],
            "status": statuses.get(s.id),
        }
        for s in students
    ]


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
