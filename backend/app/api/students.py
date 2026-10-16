import secrets
from collections import defaultdict
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import Field, field_validator
from sqlalchemy import delete, func, or_, select

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
from app.models import (
    Exam,
    ExamSchool,
    ExamSlot,
    Membership,
    Participation,
    Staff,
    Student,
    StudyGroup,
)
from app.schemas.base import NonEmpty, Schema
from app.schemas.student import StudentRead
from app.services.access_code import hash_code, reset_code, unlock
from app.time import utcnow

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
            .where(
                Membership.ended_at.is_(None),
                StudyGroup.teacher_id == current_teacher_id,
                StudyGroup.is_active.is_(True),
            )
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


class StudentCreate(Schema):
    last_name: NonEmpty
    first_name: NonEmpty
    phone: str | None = None
    grade: int = Field(ge=1, le=11)
    group_ids: list[int] = []
    give_code: bool = False


@router.post("", dependencies=[Depends(require_admin)], status_code=201)
def create_student(data: StudentCreate, session: WriteSession):
    """An administrator adds a pupil by hand; the code is chosen by the pupil or issued here."""
    full_name = " ".join(f"{data.last_name} {data.first_name}".split())
    key = normalize_name(full_name)
    taken = session.scalar(
        select(Student.id).where(
            (Student.name_key == key) | Student.name_key.startswith(key + " ", autoescape=True)
        )
    )
    if taken is not None:
        raise HTTPException(409, "Ученик с такими фамилией и именем уже есть")
    group_ids = list(dict.fromkeys(data.group_ids))
    for group_id in group_ids:
        get_or_404(session, StudyGroup, group_id)
    code = f"{secrets.randbelow(10**6):06d}" if data.give_code else None
    student = Student(
        full_name=full_name,
        name_key=key,
        grade=data.grade,
        is_active=True,
        phone=data.phone or None,
        self_registered=True,
        access_code_hash=hash_code(code) if code else None,
    )
    session.add(student)
    session.flush()
    for group_id in group_ids:
        session.add(Membership(student_id=student.id, group_id=group_id, started_at=utcnow().date()))
    session.flush()
    return {"student": StudentRead.model_validate(student).model_dump(mode="json"), "code": code}


class ApplicationBooking(Schema):
    subject: str
    title: str | None
    starts_at: datetime
    school_name: str | None
    status: str

    @field_validator("starts_at")
    @classmethod
    def utc_time(cls, value):
        return value.replace(tzinfo=UTC)


class Application(Schema):
    id: int
    full_name: str
    phone: str | None
    requested_at: datetime | None
    bookings: list[ApplicationBooking] = []

    @field_validator("requested_at")
    @classmethod
    def utc_time(cls, value):
        return value.replace(tzinfo=UTC) if value is not None else None


class ApplicationApprove(Schema):
    grade: int = Field(ge=1, le=11)
    group_id: int | None = Field(default=None, gt=0)


def pending_student(session, student_id: int) -> Student:
    student = get_or_404(session, Student, student_id)
    if not student.is_pending:
        raise HTTPException(404, "Заявка уже обработана")
    return student


@router.get(
    "/applications",
    response_model=list[Application],
    dependencies=[Depends(require_admin)],
)
def applications(session: ReadSession):
    pending = session.scalars(
        select(Student)
        .where(Student.is_pending.is_(True))
        .order_by(Student.requested_at.desc(), Student.id.desc())
    ).all()
    # What the applicant has already booked: the administrator calls to confirm exactly that.
    bookings = defaultdict(list)
    rows = session.execute(
        select(Participation, Exam, ExamSlot, ExamSchool.name)
        .join(Exam, Exam.id == Participation.exam_id)
        .outerjoin(ExamSlot, ExamSlot.id == Participation.slot_id)
        .outerjoin(ExamSchool, ExamSchool.id == ExamSlot.school_id)
        .where(
            Participation.student_id.in_([student.id for student in pending]),
            Participation.status != "cancelled",
        )
    )
    for participation, exam, slot, school_name in rows:
        bookings[participation.student_id].append(
            {
                "subject": exam.subject,
                "title": exam.title,
                "starts_at": slot.starts_at if slot else exam.starts_at,
                "school_name": school_name,
                "status": participation.status,
            }
        )
    return [
        {
            "id": student.id,
            "full_name": student.full_name,
            "phone": student.phone,
            "requested_at": student.requested_at,
            "bookings": sorted(bookings[student.id], key=lambda item: item["starts_at"]),
        }
        for student in pending
    ]


@router.post(
    "/applications/{student_id}/approve",
    response_model=StudentRead,
    dependencies=[Depends(require_admin)],
)
def approve_application(student_id: int, data: ApplicationApprove, session: WriteSession):
    student = pending_student(session, student_id)
    if data.group_id is not None:
        get_or_404(session, StudyGroup, data.group_id)
        session.add(
            Membership(student_id=student.id, group_id=data.group_id, started_at=utcnow().date())
        )
    student.grade = data.grade
    student.is_pending = False
    student.is_active = True
    session.flush()
    return student


@router.delete("/applications/{student_id}", dependencies=[Depends(require_admin)])
def reject_application(student_id: int, session: WriteSession):
    # The person may already have signed up for exams: those bookings go with the application.
    student = pending_student(session, student_id)
    session.execute(delete(Participation).where(Participation.student_id == student.id))
    session.delete(student)
    return {"status": "rejected"}


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
    query = select(Student).where(Student.is_active.is_(True), Student.is_pending.is_(False))
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
                StudyGroup.is_active.is_(True),
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
        query = query.join(StudyGroup).where(
            StudyGroup.teacher_id == current_teacher_id, StudyGroup.is_active.is_(True)
        )
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
