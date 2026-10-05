import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import exists, or_, select

from app.api.dependencies import (
    Limit,
    Offset,
    ReadSession,
    WriteSession,
    get_or_404,
    staff_id,
    teacher_id,
)
from app.models import Exam, Membership, Participation, Staff, StudyGroup
from app.schemas.participation import (
    FeedbackWrite,
    ParticipationStaffRead,
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


def _subject_key(value: str | None) -> str:
    return re.sub(r"[^а-яa-z0-9]+", " ", (value or "").casefold().replace("ё", "е")).strip()


def require_teacher_access(
    session,
    student_id: int,
    exam_id: int,
    current_teacher_id: int | None,
    item: Participation | None = None,
) -> None:
    """A teacher works with own pupils and checks pupils of other groups on their subject."""
    if current_teacher_id is None:
        return
    try:
        require_teacher_student(session, student_id, current_teacher_id)
        return
    except HTTPException:
        pass
    teacher = session.get(Staff, current_teacher_id)
    if item is not None and teacher is not None and item.checked_by == teacher.name:
        return
    exam = session.get(Exam, exam_id)
    if exam is not None:
        exam_subject = _subject_key(exam.subject)
        subjects = session.scalars(
            select(StudyGroup.subject).where(
                StudyGroup.teacher_id == current_teacher_id, StudyGroup.subject.is_not(None)
            )
        )
        for subject in subjects:
            group_subject = _subject_key(subject)
            if group_subject and (group_subject in exam_subject or exam_subject in group_subject):
                return
    raise HTTPException(404, "Ученик не относится к вашим группам или предмету")


@router.post("", response_model=ParticipationStaffRead, status_code=201)
def create_participation(
    data: Registration,
    session: WriteSession,
    current_teacher_id: int | None = Depends(teacher_id),
):
    require_teacher_student(session, data.student_id, current_teacher_id)
    return register(session, data)


@router.get("", response_model=list[ParticipationStaffRead])
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
        teacher = session.get(Staff, current_teacher_id)
        query = query.where(
            or_(
                Participation.student_id.in_(own_students),
                Participation.checked_by == (teacher.name if teacher else None),
            )
        )
    if student_id is not None:
        query = query.where(Participation.student_id == student_id)
    if exam_id is not None:
        query = query.where(Participation.exam_id == exam_id)
    return session.scalars(query.limit(limit).offset(offset)).all()


@router.post("/quick-result", response_model=ParticipationStaffRead)
def create_or_update_quick_result(
    data: QuickResultWrite,
    session: WriteSession,
    current_teacher_id: int | None = Depends(teacher_id),
    author_id: int | None = Depends(staff_id),
):
    existing = session.scalar(
        select(Participation).where(
            Participation.student_id == data.student_id, Participation.exam_id == data.exam_id
        )
    )
    require_teacher_access(session, data.student_id, data.exam_id, current_teacher_id, existing)
    return quick_save_result(session, data, checker_name(session, author_id))


@router.put("/feedback", response_model=list[ParticipationStaffRead])
def save_feedback(
    data: FeedbackWrite,
    session: WriteSession,
    current_teacher_id: int | None = Depends(teacher_id),
):
    """The same note and delivery status for every work of one student in one exam event."""
    items = list(
        session.scalars(select(Participation).where(Participation.id.in_(data.participation_ids)))
    )
    if len(items) != len(set(data.participation_ids)):
        raise HTTPException(404, "Работа не найдена")
    if len({item.student_id for item in items}) > 1:
        raise ValueError("Заметку можно сохранить только по одному ученику")
    for item in items:
        require_teacher_access(session, item.student_id, item.exam_id, current_teacher_id, item)
        if "feedback" in data.model_fields_set:
            item.feedback = (data.feedback or "").strip() or None
        if data.parent_status is not None:
            item.parent_status = data.parent_status
    session.flush()
    return items


@router.patch("/{participation_id}/status", response_model=ParticipationStaffRead)
def update_status(
    participation_id: int,
    data: StatusChange,
    session: WriteSession,
    current_teacher_id: int | None = Depends(teacher_id),
):
    item = get_or_404(session, Participation, participation_id)
    require_teacher_access(session, item.student_id, item.exam_id, current_teacher_id, item)
    change_status(item, data.status)
    session.flush()
    return item


@router.put("/{participation_id}/result", response_model=ParticipationStaffRead)
def update_result(
    participation_id: int,
    data: ResultWrite,
    session: WriteSession,
    current_teacher_id: int | None = Depends(teacher_id),
    author_id: int | None = Depends(staff_id),
):
    item = get_or_404(session, Participation, participation_id)
    require_teacher_access(session, item.student_id, item.exam_id, current_teacher_id, item)
    save_result(session, item, data, checker_name(session, author_id))
    if item.status == "submitted":
        change_status(item, "checked")
    session.flush()
    return item


@router.post("/{participation_id}/publish", response_model=ParticipationStaffRead)
def publish_result(
    participation_id: int,
    data: ResultWrite,
    session: WriteSession,
    current_teacher_id: int | None = Depends(teacher_id),
    author_id: int | None = Depends(staff_id),
):
    item = get_or_404(session, Participation, participation_id)
    require_teacher_access(session, item.student_id, item.exam_id, current_teacher_id, item)
    save_result(session, item, data, checker_name(session, author_id))
    if item.status == "submitted":
        change_status(item, "checked")
    change_status(item, "published")
    session.flush()
    return item
