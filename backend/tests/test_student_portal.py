from datetime import timedelta

from sqlalchemy import select

from app.database import transaction
from app.models import Exam, Participation, Student
from app.time import utcnow


def seed(engine):
    with transaction(engine, write=True) as session:
        session.add_all(
            [
                Student(full_name="Иванов Алексей Петрович", name_key="иванов алексей петрович"),
                Student(full_name="Петров Иван", name_key="петров иван"),
            ]
        )
        session.add(
            Exam(type="mock", subject="Информатика", starts_at=utcnow() + timedelta(days=10))
        )


def login(client):
    response = client.post(
        "/api/student/login",
        json={"last_name": "ИВАНОВ", "first_name": "Алексей", "code": "123456"},
    )
    assert response.status_code == 200
    return {"Authorization": "Bearer " + response.json()["token"]}


def test_student_registration_and_only_published_own_results(client, engine):
    seed(engine)
    headers = login(client)
    assert client.get("/api/students", headers=headers).status_code == 401
    assert client.get("/api/student/me", headers=headers).json()["id"] == 1
    response = client.post("/api/student/exams/1/register", headers=headers)
    assert response.status_code == 200
    assert (
        client.post("/api/student/exams/1/register", headers=headers).json()["id"]
        == response.json()["id"]
    )
    with transaction(engine, write=True) as session:
        item = session.scalar(select(Participation))
        item.status = "submitted"
        session.add(Participation(student_id=2, exam_id=1, status="published", primary_score=50))
    response = client.put(
        "/api/participations/1/result", json={"primary_score": 20, "test_score": 72}
    )
    assert response.status_code == 200 and response.json()["status"] == "checked"
    assert client.get("/api/student/results", headers=headers).json() == []
    own_rows = client.get("/api/student/participations", headers=headers).json()
    assert len(own_rows) == 1
    assert "primary_score" not in own_rows[0] and "result_data" not in own_rows[0]
    response = client.post(
        "/api/participations/1/publish", json={"primary_score": 20, "test_score": 72}
    )
    assert response.status_code == 200 and response.json()["published_at"]
    results = client.get("/api/student/results", headers=headers).json()
    assert len(results) == 1 and results[0]["student_id"] == 1 and results[0]["test_score"] == 72
    assert (
        client.get(
            "/api/student/me", headers={"Authorization": headers["Authorization"] + "x"}
        ).status_code
        == 401
    )


def test_registration_window_and_inactive_student_enforced(client, engine):
    seed(engine)
    headers = login(client)
    with transaction(engine, write=True) as session:
        session.get(Exam, 1).registration_open_at = utcnow() + timedelta(days=2)
    assert client.post("/api/student/exams/1/register", headers=headers).status_code == 422
    with transaction(engine, write=True) as session:
        session.get(Exam, 1).registration_open_at = None
        session.get(Student, 1).is_active = False
    assert client.post("/api/student/exams/1/register", headers=headers).status_code == 422


def test_ambiguous_login_is_rejected(client, engine):
    seed(engine)
    with transaction(engine, write=True) as session:
        session.add(
            Student(full_name="Иванов Алексей Иванович", name_key="иванов алексей иванович")
        )
    response = client.post(
        "/api/student/login", json={"last_name": "Иванов", "first_name": "Алексей"}
    )
    assert response.status_code == 422
