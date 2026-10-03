from datetime import timedelta

from app.database import transaction
from app.models import Staff, Student, StudyGroup
from app.time import utcnow

LOGIN = {"last_name": "Иванов", "first_name": "Алексей"}


def seed(engine):
    with transaction(engine, write=True) as session:
        session.add(Student(full_name="Иванов Алексей", name_key="иванов алексей", grade=10))
        teacher = Staff(
            name="Екатерина Сергеевна",
            login="teacher:екатерина сергеевна",
            password_hash="",
            role="teacher",
        )
        session.add(teacher)
        session.flush()
        session.add(StudyGroup(source_name="Физика ПН 15:00", teacher_id=teacher.id))


def expire_lock(engine):
    with transaction(engine, write=True) as session:
        student = session.get(Student, 1)
        student.locked_until = utcnow() - timedelta(seconds=1)


def post(client, code=None):
    data = dict(LOGIN)
    if code is not None:
        data["code"] = code
    return client.post("/api/student/login", json=data)


def test_first_login_asks_to_create_code_then_requires_it(client, engine):
    seed(engine)
    assert post(client).json() == {"status": "code_new"}
    assert post(client, "12345").status_code == 422
    created = post(client, "123456")
    assert created.status_code == 200 and created.json()["status"] == "ok"
    assert post(client).json() == {"status": "code_required"}
    assert post(client, "123456").json()["status"] == "ok"
    assert post(client, "654321").status_code == 401


def test_five_wrong_codes_lock_for_5_minutes_then_30(client, engine):
    seed(engine)
    post(client, "123456")
    for left in (4, 3, 2, 1):
        response = post(client, "000000")
        assert response.status_code == 401
        assert f"Осталось попыток: {left}" in response.json()["detail"]
    fifth = post(client, "000000")
    assert fifth.status_code == 429 and "5 мин" in fifth.json()["detail"]
    # Верный код не пускает, пока блокировка не закончилась.
    assert post(client, "123456").status_code == 429
    with transaction(engine) as session:
        assert 4 <= (session.get(Student, 1).locked_until - utcnow()).total_seconds() / 60 <= 5

    expire_lock(engine)
    for _ in range(4):
        assert post(client, "000000").status_code == 401
    second = post(client, "000000")
    assert second.status_code == 429 and "30 мин" in second.json()["detail"]

    expire_lock(engine)
    assert post(client, "123456").json()["status"] == "ok"
    # После успешного входа счётчик блокировок обнуляется.
    for _ in range(5):
        response = post(client, "000000")
    assert "5 мин" in response.json()["detail"]


def test_admin_can_unlock_and_reset_student_code(client, engine):
    seed(engine)
    post(client, "123456")
    for _ in range(5):
        post(client, "000000")
    listed = client.get("/api/students").json()[0]
    assert listed["has_code"] is True and listed["locked_until"].endswith("Z")
    assert client.post("/api/students/1/unlock").status_code == 200
    assert post(client, "123456").json()["status"] == "ok"

    reset = client.post("/api/students/1/reset-code")
    assert reset.status_code == 200 and reset.json()["has_code"] is False
    assert reset.json()["last_login_at"] is not None
    assert post(client).json() == {"status": "code_new"}
    assert post(client, "123456").json()["status"] == "ok"


def test_student_cannot_manage_codes(client, engine):
    seed(engine)
    token = post(client, "123456").json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.post("/api/students/1/reset-code", headers=headers).status_code in (401, 403)
    assert client.post("/api/students/1/unlock", headers=headers).status_code in (401, 403)


def test_teacher_code_flow_and_admin_reset(client, engine):
    seed(engine)
    login = {"first_name": "Екатерина", "middle_name": "Сергеевна"}
    assert client.post("/api/teacher/login", json=login).json() == {"status": "code_new"}
    ok = client.post("/api/teacher/login", json={**login, "code": "111111"})
    assert ok.status_code == 200 and ok.json()["status"] == "ok"
    wrong = client.post("/api/teacher/login", json={**login, "code": "222222"})
    assert wrong.status_code == 401
    teacher = client.get("/api/teachers").json()[0]
    assert teacher["has_code"] is True and teacher["last_login_at"] is not None
    reset = client.post(f"/api/teachers/{teacher['id']}/reset-code")
    assert reset.status_code == 200 and reset.json()["has_code"] is False
    assert client.post("/api/teacher/login", json=login).json() == {"status": "code_new"}
