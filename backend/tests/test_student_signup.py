from datetime import timedelta

from app.database import transaction
from app.models import Exam, Membership, Participation, Student, StudyGroup
from app.time import utcnow

SIGNUP = {
    "last_name": "Лебедев",
    "first_name": "Артём",
    "code": "593108",
    "phone": "8 912 345-67-89",
}


def sign_up(client, **changes):
    return client.post("/api/student/register", json={**SIGNUP, **changes})


def login(client, code="593108"):
    return client.post(
        "/api/student/login", json={"last_name": "Лебедев", "first_name": "Артём", "code": code}
    )


def test_signup_logs_in_at_once_and_allows_booking(client, engine):
    signed = sign_up(client)
    assert signed.status_code == 201
    assert signed.json()["status"] == "ok"
    assert signed.json()["student"]["is_pending"] is True
    with transaction(engine, write=True) as session:
        exam = Exam(type="mock", subject="Физика", title="Т", starts_at=utcnow() + timedelta(days=3))
        exam.is_active = True
        session.add(exam)
        session.flush()
        exam_id = exam.id
    headers = {"Authorization": f"Bearer {signed.json()['token']}"}
    assert client.post(f"/api/student/exams/{exam_id}/register", headers=headers).status_code == 200


def test_applicant_logs_in_and_books_but_stays_pending(client, engine):
    assert sign_up(client).status_code == 201

    applications = client.get("/api/students/applications").json()
    assert [a["full_name"] for a in applications] == ["Лебедев Артём"]
    assert applications[0]["phone"] == "+7 (912) 345-67-89"
    assert client.get("/api/students/search", params={"q": "Лебедев"}).json() == []

    result = login(client)
    assert result.status_code == 200
    assert result.json()["student"]["is_pending"] is True
    with transaction(engine, write=True) as session:
        exam = Exam(type="mock", subject="Физика", title="Т", starts_at=utcnow() + timedelta(days=3))
        exam.is_active = True
        session.add(exam)
        session.flush()
        exam_id = exam.id
    headers = {"Authorization": f"Bearer {result.json()['token']}"}
    booked = client.post(f"/api/student/exams/{exam_id}/register", headers=headers)
    assert booked.status_code == 200
    assert client.get("/api/student/me", headers=headers).json()["is_pending"] is True


def test_approve_activates_student_with_grade_group_and_own_code(client, engine):
    with transaction(engine, write=True) as session:
        group = StudyGroup(source_name="Математика · ЕГЭ")
        session.add(group)
        session.flush()
        group_id = group.id
    sign_up(client)
    student_id = client.get("/api/students/applications").json()[0]["id"]

    response = client.post(
        f"/api/students/applications/{student_id}/approve",
        json={"grade": 11, "group_id": group_id},
    )
    assert response.status_code == 200
    assert response.json()["is_active"] is True
    assert client.get("/api/students/applications").json() == []
    assert [s["full_name"] for s in client.get("/api/students").json()] == ["Лебедев Артём"]
    with transaction(engine) as session:
        assert session.query(Membership).filter_by(student_id=student_id).count() == 1

    # The password from the registration works, not a code chosen on first login.
    assert login(client, "000000").status_code == 401
    assert login(client).json()["status"] == "ok"


def test_reject_removes_application(client, engine):
    sign_up(client)
    student_id = client.get("/api/students/applications").json()[0]["id"]
    with transaction(engine, write=True) as session:
        exam = Exam(type="mock", subject="Физика", title="Т", starts_at=utcnow() + timedelta(days=3))
        session.add(exam)
        session.flush()
        session.add(Participation(student_id=student_id, exam_id=exam.id, status="registered"))

    assert client.delete(f"/api/students/applications/{student_id}").status_code == 200
    with transaction(engine) as session:
        assert session.query(Student).count() == 0
        assert session.query(Participation).count() == 0
    assert client.delete(f"/api/students/applications/{student_id}").status_code == 404


def test_signup_validates_input_and_rejects_known_names(client, engine):
    assert sign_up(client, code="123").status_code == 422
    assert sign_up(client, phone="12345").status_code == 422
    assert sign_up(client).status_code == 201
    assert sign_up(client, last_name=" лебедев ").status_code == 409
    with transaction(engine, write=True) as session:
        session.add(Student(full_name="Иванов Алексей", name_key="иванов алексей", grade=10))
    assert sign_up(client, last_name="Иванов", first_name="Алексей").status_code == 409


def test_admin_adds_student_with_groups_and_issued_code(client, engine):
    with transaction(engine, write=True) as session:
        group = StudyGroup(source_name="Математика · ЕГЭ")
        session.add(group)
        session.flush()
        group_id = group.id
    body = {"last_name": "Орлов", "first_name": "Пётр", "grade": 10, "group_ids": [group_id]}

    issued = client.post("/api/students", json={**body, "give_code": True})
    assert issued.status_code == 201
    code = issued.json()["code"]
    assert len(code) == 6 and code.isdigit()
    login_result = client.post(
        "/api/student/login", json={"last_name": "Орлов", "first_name": "Пётр", "code": code}
    )
    assert login_result.json()["status"] == "ok"
    with transaction(engine) as session:
        assert session.query(Membership).count() == 1

    assert client.post("/api/students", json=body).status_code == 409
    own = client.post("/api/students", json={**body, "last_name": "Орлова"})
    assert own.json()["code"] is None
    assert own.json()["student"]["has_code"] is False


def test_application_shows_where_the_applicant_booked(client, engine):
    from app.models import ExamEvent, ExamSchool, ExamSlot

    signed = sign_up(client)
    student_id = signed.json()["student"]["id"]
    with transaction(engine, write=True) as session:
        event = ExamEvent(title="Осенний")
        session.add(event)
        session.flush()
        start = utcnow() + timedelta(days=3)
        exam = Exam(
            event_id=event.id, type="mock", subject="Физика", title="Осенний", starts_at=start
        )
        school = ExamSchool(event_id=event.id, name="Школа 12")
        session.add_all([exam, school])
        session.flush()
        slot = ExamSlot(
            event_id=event.id, exam_id=exam.id, school_id=school.id, starts_at=start, capacity=5
        )
        other = Exam(type="mock", subject="Химия", title="Без школы", starts_at=start)
        session.add_all([slot, other])
        session.flush()
        session.add_all(
            [
                Participation(
                    student_id=student_id, exam_id=exam.id, slot_id=slot.id, status="registered"
                ),
                Participation(student_id=student_id, exam_id=other.id, status="cancelled"),
            ]
        )

    [application] = client.get("/api/students/applications").json()
    [booking] = application["bookings"]  # the cancelled one is not shown
    assert booking["subject"] == "Физика" and booking["school_name"] == "Школа 12"
    assert booking["starts_at"].endswith("Z")  # UTC, so the browser shows local time

    empty = sign_up(client, last_name="Орлов", first_name="Пётр")
    assert empty.status_code == 201
    rows = {a["full_name"]: a for a in client.get("/api/students/applications").json()}
    assert rows["Орлов Пётр"]["bookings"] == []
