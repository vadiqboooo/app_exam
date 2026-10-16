from datetime import UTC
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.dependencies import Limit, Offset, ReadSession, WriteSession, bearer, get_or_404
from app.importers.record import normalize_name
from app.models import Exam, ExamEvent, ExamSlot, Participation, Student
from app.schemas.exam import ExamRead
from app.schemas.participation import ParticipationRead, Registration
from app.schemas.student import StudentRead
from app.schemas.student_portal import (
    StudentLogin,
    StudentParticipation,
    StudentRegistration,
    StudentSignup,
)
from app.services.access_code import Rejected, authenticate, hash_code
from app.services.exams import read_exams
from app.services.participation import change_status, check_slot, register
from app.services.student_session import issue_token, read_token
from app.time import utcnow

router = APIRouter(prefix="/api/student", tags=["student portal"])


@router.post("/login")
def login(data: StudentLogin, request: Request, session: WriteSession):
    settings = request.app.state.settings
    if not settings.api_key:
        raise HTTPException(503, "Настройте API_KEY для входа учеников")
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
    result = authenticate(student, data.code)
    if isinstance(result, Rejected):
        # Ответ без исключения: иначе транзакция откатится и счётчик попыток потеряется.
        return JSONResponse({"detail": result.detail}, status_code=result.status)
    if result != "ok":
        return {"status": result}
    return {
        "status": "ok",
        "token": issue_token(student.id, settings.api_key),
        "student": StudentRead.model_validate(student).model_dump(mode="json"),
    }


def _utc(value):
    return value.replace(tzinfo=UTC).isoformat() if value is not None else None


@router.get("/current-event")
def current_event(session: ReadSession):
    """The nearest mock exam open for booking: shown on the login screen before signing in."""
    now = utcnow()
    best = None
    for event in session.scalars(select(ExamEvent)):
        exams = list(
            session.scalars(
                select(Exam).where(
                    Exam.event_id == event.id, Exam.type == "mock", Exam.is_active.is_(True)
                )
            )
        )
        slots = list(
            session.scalars(
                select(ExamSlot).where(ExamSlot.event_id == event.id, ExamSlot.starts_at > now)
            )
        )
        if not exams or not slots:
            continue
        opens = max((e.registration_open_at for e in exams if e.registration_open_at), default=None)
        closes = max((e.registration_close_at for e in exams if e.registration_close_at), default=None)
        if closes is not None and closes <= now:
            continue
        starts = min(slot.starts_at for slot in slots)
        if best is None or starts < best["starts"]:
            booked = dict(
                session.execute(
                    select(Participation.slot_id, func.count())
                    .where(
                        Participation.slot_id.in_([s.id for s in slots]),
                        Participation.status != "cancelled",
                    )
                    .group_by(Participation.slot_id)
                ).all()
            )
            best = {
                "starts": starts,
                "body": {
                    "title": event.title,
                    "state": "soon" if opens is not None and opens > now else "open",
                    "starts_at": _utc(starts),
                    "ends_at": _utc(max(slot.starts_at for slot in slots)),
                    "registration_open_at": _utc(opens),
                    "registration_close_at": _utc(closes),
                    "free_seats": sum(max(s.capacity - booked.get(s.id, 0), 0) for s in slots),
                },
            }
    return best["body"] if best else None


MAX_PENDING = 200


@router.post("/register", status_code=201)
def sign_up(data: StudentSignup, request: Request, session: WriteSession):
    """A person from outside the school signs up and can book at once.

    The booking becomes final after the administrator's call: they confirm the application.
    """
    settings = request.app.state.settings
    if not settings.api_key:
        raise HTTPException(503, "Настройте API_KEY для входа учеников")
    phone_digits = "".join(ch for ch in data.phone if ch.isdigit())
    if len(phone_digits) != 11:
        raise ValueError("Введите телефон полностью, например +7 (900) 123-45-67")
    full_name = " ".join(f"{data.last_name} {data.first_name}".split())
    key = normalize_name(full_name)
    taken = session.scalar(
        select(Student.id).where(
            (Student.name_key == key) | Student.name_key.startswith(key + " ", autoescape=True)
        )
    )
    if taken is not None:
        raise HTTPException(
            409,
            "Ученик с такими фамилией и именем уже есть. "
            "Войдите по коду от школы или обратитесь к администратору",
        )
    pending = session.scalar(
        select(func.count()).select_from(Student).where(Student.is_pending.is_(True))
    )
    if pending >= MAX_PENDING:
        raise HTTPException(429, "Слишком много заявок. Позвоните в школу")
    student = Student(
        full_name=full_name,
        name_key=key,
        grade=None,
        is_active=True,
        phone=f"+7 ({phone_digits[1:4]}) {phone_digits[4:7]}-{phone_digits[7:9]}-{phone_digits[9:]}",
        self_registered=True,
        is_pending=True,
        requested_at=utcnow(),
        access_code_hash=hash_code(data.code),
        last_login_at=utcnow(),
    )
    session.add(student)
    session.flush()
    return {
        "status": "ok",
        "token": issue_token(student.id, settings.api_key),
        "student": StudentRead.model_validate(student).model_dump(mode="json"),
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
