from datetime import timedelta

from app.database import transaction
from app.models import Exam, ExamEvent, ExamSchool, ExamSlot, Participation, Student
from app.time import utcnow


def seed(session, *, title, starts_in, closes_in=None, capacity=10):
    now = utcnow()
    event = ExamEvent(title=title)
    session.add(event)
    session.flush()
    exam = Exam(
        event_id=event.id,
        type="mock",
        subject="Физика",
        title=title,
        starts_at=now + timedelta(days=starts_in),
        registration_close_at=now + timedelta(days=closes_in) if closes_in is not None else None,
        is_active=True,
    )
    school = ExamSchool(event_id=event.id, name="Школа 1")
    session.add_all([exam, school])
    session.flush()
    slots = [
        ExamSlot(
            event_id=event.id,
            exam_id=exam.id,
            school_id=school.id,
            starts_at=now + timedelta(days=starts_in + offset),
            capacity=capacity,
        )
        for offset in (0, 2)
    ]
    session.add_all(slots)
    session.flush()
    return exam, slots


def current(client):
    # The login screen asks before anybody has signed in.
    return client.get("/api/student/current-event", headers={"Authorization": ""})


def test_nothing_to_show_without_open_event(client):
    assert current(client).json() is None


def test_nearest_open_event_with_days_period_and_free_seats(client, engine):
    with transaction(engine, write=True) as session:
        exam, slots = seed(session, title="Осенний пробник", starts_in=5, closes_in=3, capacity=10)
        seed(session, title="Позже", starts_in=20, closes_in=18)
        seed(session, title="Запись закрыта", starts_in=1, closes_in=-1)
        student = Student(full_name="Иванов Иван", name_key="иванов иван")
        session.add(student)
        session.flush()
        session.add(
            Participation(
                student_id=student.id, exam_id=exam.id, slot_id=slots[0].id, status="registered"
            )
        )

    body = current(client).json()
    assert body["title"] == "Осенний пробник"
    assert body["state"] == "open"
    assert body["free_seats"] == 19
    assert body["starts_at"] < body["ends_at"]
    assert body["registration_close_at"].endswith("+00:00")
