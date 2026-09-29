from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import Limit, Offset, ReadSession, WriteSession, bearer, get_or_404
from app.importers.record import normalize_name
from app.models import Exam, ExamSlot, Participation, Student
from app.schemas.exam import ExamRead
from app.schemas.participation import ParticipationRead, Registration
from app.schemas.student import StudentRead
from app.schemas.student_portal import StudentLogin, StudentParticipation, StudentRegistration
from app.services.exams import read_exams
from app.services.participation import change_status, check_slot, register
from app.services.student_session import issue_token, read_token
from app.time import utcnow

router = APIRouter(prefix="/api/student", tags=["student portal"])


@router.post("/login")
def login(data: StudentLogin, request: Request, session: ReadSession):
    settings = request.app.state.settings
    if not settings.student_test_login or not settings.api_key:
        raise HTTPException(503, "Тестовый вход по имени отключён")
    name = normalize_name(f"{data.last_name} {data.first_name}")
    matches = list(
        session.scalars(
            select(Student).where(
                (Student.name_key == name)
                | Student.name_key.startswith(name + " ", autoescape=True)
            )
        )
    )
    if len(matches) != 1:
        raise HTTPException(
            422, "Ученик не найден или есть полные тёзки. Обратитесь к администратору"
        )
    student = matches[0]
    if student.access_code_hash:
        raise HTTPException(403, "Для этого ученика вход только по имени недоступен")
    return {
        "token": issue_token(student.id, settings.api_key),
        "student": StudentRead.model_validate(student).model_dump(),
    }


def current_student(
    request: Request,
    session: ReadSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
):
    try:
        student_id = read_token(
            credentials.credentials if credentials else "", request.app.state.settings.api_key
        )
    except ValueError as error:
        raise HTTPException(401, str(error)) from error
    return get_or_404(session, Student, student_id)


CurrentStudent = Annotated[Student, Depends(current_student)]


@router.get("/me", response_model=StudentRead)
def me(student: CurrentStudent):
    return student


@router.get("/exams", response_model=list[ExamRead])
def exams(student: CurrentStudent, session: ReadSession, limit: Limit = 100, offset: Offset = 0):
    # Include past exams with this student's participation for the result history.
    own_exam_ids = select(Participation.exam_id).where(Participation.student_id == student.id)
    future_slot_events = select(ExamSlot.event_id).where(ExamSlot.starts_at > utcnow())
    query = (
        select(Exam)
        .where(
            (Exam.id.in_(own_exam_ids))
            | (
                (Exam.is_active.is_(True))
                & (Exam.type == "mock")
                & ((Exam.starts_at > utcnow()) | Exam.event_id.in_(future_slot_events))
            )
        )
        .order_by(Exam.starts_at, Exam.id)
    )
    return read_exams(session, list(session.scalars(query.limit(limit).offset(offset))))


@router.get("/participations", response_model=list[StudentParticipation])
def participations(
    student: CurrentStudent, session: ReadSession, limit: Limit = 100, offset: Offset = 0
):
    return session.scalars(
        select(Participation)
        .where(Participation.student_id == student.id)
        .order_by(Participation.id)
        .limit(limit)
        .offset(offset)
    ).all()


@router.get("/results", response_model=list[ParticipationRead])
def results(student: CurrentStudent, session: ReadSession, limit: Limit = 100, offset: Offset = 0):
    return session.scalars(
        select(Participation)
        .where(Participation.student_id == student.id, Participation.status == "published")
        .order_by(Participation.id)
        .limit(limit)
        .offset(offset)
    ).all()


@router.post("/exams/{exam_id}/register", response_model=StudentParticipation)
def register_for_exam(
    exam_id: int,
    student: CurrentStudent,
    session: WriteSession,
    data: StudentRegistration | None = None,
):
    exam = get_or_404(session, Exam, exam_id)
    now = utcnow()
    if (
        not student.is_active
        or not exam.is_active
        or exam.type != "mock"
        or (exam.event_id is None and exam.starts_at <= now)
        or (exam.registration_open_at and now < exam.registration_open_at)
        or (exam.registration_close_at and now >= exam.registration_close_at)
    ):
        raise ValueError("Регистрация на этот пробник недоступна")
    item = session.scalar(
        select(Participation).where(
            Participation.student_id == student.id, Participation.exam_id == exam_id
        )
    )
    if item is None:
        item = register(
            session,
            Registration(
                student_id=student.id,
                exam_id=exam_id,
                slot_id=data.slot_id if data else None,
            ),
        )
    elif item.status == "cancelled":
        if data and data.slot_id is not None:
            item.slot_id = data.slot_id
        change_status(item, "registered")
    elif data and data.slot_id is not None and data.slot_id != item.slot_id:
        raise ValueError("Вы уже записаны на этот предмет на другое время")
    session.flush()
    return item


def own_participation(participation_id: int, student: Student, session: Session) -> Participation:
    item = session.get(Participation, participation_id)
    if item is None or item.student_id != student.id:
        raise HTTPException(404, "Запись не найдена")
    return item


@router.patch("/participations/{participation_id}", response_model=StudentParticipation)
def update_registration(
    participation_id: int,
    data: StudentRegistration,
    student: CurrentStudent,
    session: WriteSession,
):
    item = own_participation(participation_id, student, session)
    exam = get_or_404(session, Exam, item.exam_id)
    now = utcnow()
    if item.status != "registered":
        raise ValueError("Изменить можно только действующую запись")
    if (
        not student.is_active
        or not exam.is_active
        or exam.type != "mock"
        or (exam.event_id is None and exam.starts_at <= now)
        or (exam.registration_open_at and now < exam.registration_open_at)
        or (exam.registration_close_at and now >= exam.registration_close_at)
    ):
        raise ValueError("Изменение записи на этот пробник недоступно")
    check_slot(session, student.id, exam, data.slot_id, item.id)
    item.slot_id = data.slot_id
    session.flush()
    return item


@router.delete("/participations/{participation_id}", response_model=StudentParticipation)
def cancel_registration(
    participation_id: int,
    student: CurrentStudent,
    session: WriteSession,
):
    item = own_participation(participation_id, student, session)
    if item.status != "registered":
        raise ValueError("Удалить можно только действующую запись")
    exam = get_or_404(session, Exam, item.exam_id)
    slot = session.get(ExamSlot, item.slot_id) if item.slot_id is not None else None
    starts_at = slot.starts_at if slot is not None else exam.starts_at
    if starts_at <= utcnow():
        raise ValueError("Нельзя удалить запись после начала экзамена")
    change_status(item, "cancelled")
    session.flush()
    return item
