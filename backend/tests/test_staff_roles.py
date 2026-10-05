from app.database import transaction
from app.models import Exam
from app.time import utcnow
from tests.test_subject_responsible import import_teachers, teacher_headers


def staff(client):
    import_teachers(client)
    return {t["name"]: t for t in client.get("/api/teachers").json()}


def set_roles(client, staff_id, roles, **kwargs):
    return client.put(f"/api/teachers/{staff_id}/roles", json={"roles": roles}, **kwargs)


def test_imported_staff_are_teachers_and_roles_can_be_combined(client):
    anna = staff(client)["Анна Сергеевна"]
    assert anna["roles"] == ["teacher"]

    done = set_roles(client, anna["id"], ["teacher", "admin"])
    assert done.status_code == 200, done.text
    assert done.json()["roles"] == ["admin", "teacher"]
    listed = {t["name"]: t for t in client.get("/api/teachers").json()}
    assert listed["Анна Сергеевна"]["roles"] == ["admin", "teacher"]
    assert listed["Ольга Игоревна"]["roles"] == ["teacher"]


def test_a_person_needs_at_least_one_valid_role(client):
    anna = staff(client)["Анна Сергеевна"]
    assert set_roles(client, anna["id"], []).status_code == 422
    assert set_roles(client, anna["id"], ["director"]).status_code == 422


def test_removing_the_teacher_role_frees_groups_and_subjects(client):
    anna = staff(client)["Анна Сергеевна"]
    assert any(g["teacher_id"] == anna["id"] for g in client.get("/api/groups").json())
    subject = next(s for s in client.get("/api/subjects").json() if s["name"] == "Информатика")
    body = {
        key: subject[key]
        for key in ("name", "format", "tasks", "primary_to_secondary_scale", "grade_scale")
    } | {"is_active": True, "responsible_id": anna["id"]}
    assert client.put(f"/api/subjects/{subject['id']}", json=body).status_code == 200

    assert set_roles(client, anna["id"], ["responsible"]).status_code == 200

    assert not any(g["teacher_id"] == anna["id"] for g in client.get("/api/groups").json())
    updated = next(s for s in client.get("/api/subjects").json() if s["id"] == subject["id"])
    assert updated["responsible_id"] is None
    # Only a teacher can be made responsible for a subject.
    assert client.put(f"/api/subjects/{subject['id']}", json=body).status_code == 422


def test_pure_teacher_is_limited_but_staff_with_admin_role_is_not(client):
    people = staff(client)
    anna_headers = teacher_headers(client, "Анна", "Сергеевна")
    olga_headers = teacher_headers(client, "Ольга", "Игоревна")
    assert len(client.get("/api/groups", headers=anna_headers).json()) == 1
    assert client.get("/api/teachers", headers=anna_headers).status_code == 403

    assert (
        set_roles(client, people["Анна Сергеевна"]["id"], ["admin", "teacher"]).status_code == 200
    )

    # The same token now sees every group and may use administrator endpoints.
    assert len(client.get("/api/groups", headers=anna_headers).json()) == 2
    assert client.get("/api/teachers", headers=anna_headers).status_code == 200
    # An unrelated teacher stays limited.
    assert len(client.get("/api/groups", headers=olga_headers).json()) == 1


def test_responsible_role_sees_everything_but_not_administration(client):
    anna = staff(client)["Анна Сергеевна"]
    headers = teacher_headers(client, "Анна", "Сергеевна")
    assert set_roles(client, anna["id"], ["responsible"]).status_code == 200
    assert len(client.get("/api/groups", headers=headers).json()) == 2
    assert client.get("/api/teachers", headers=headers).status_code == 403


def test_administrator_without_groups_can_log_in_but_not_demote_or_delete_self(client):
    created = client.post(
        "/api/teachers",
        json={"first_name": "Мария", "middle_name": "Петровна", "roles": ["admin"]},
    )
    assert created.status_code == 201, created.text
    assert created.json()["roles"] == ["admin"]
    headers = teacher_headers(client, "Мария", "Петровна")

    me = created.json()["id"]
    assert set_roles(client, me, ["teacher"], headers=headers).status_code == 422
    assert client.delete(f"/api/teachers/{me}", headers=headers).status_code == 422
    assert set_roles(client, me, ["admin", "teacher"], headers=headers).status_code == 200


def test_groups_can_only_go_to_a_teacher(client):
    staff(client)
    created = client.post(
        "/api/teachers",
        json={"first_name": "Олег", "middle_name": "Викторович", "roles": ["admin"]},
    )
    assert created.status_code == 201
    group_id = next(g["id"] for g in client.get("/api/groups").json() if g["teacher_id"])
    body = {"first_name": "Олег", "middle_name": "Викторович", "group_ids": [group_id]}
    assert client.put(f"/api/teachers/{created.json()['id']}", json=body).status_code == 422


def test_results_entered_by_an_administrator_staff_carry_their_name(client, engine):
    anna = staff(client)["Анна Сергеевна"]
    assert set_roles(client, anna["id"], ["admin", "teacher"]).status_code == 200
    headers = teacher_headers(client, "Анна", "Сергеевна")
    with transaction(engine, write=True) as session:
        exam = Exam(type="mock", subject="Физика", starts_at=utcnow(), is_active=True)
        session.add(exam)
        session.flush()
        exam_id = exam.id
    student = client.get("/api/students").json()[0]["id"]

    saved = client.post(
        "/api/participations/quick-result",
        json={
            "student_id": student,
            "exam_id": exam_id,
            "primary_score": 5,
            "test_score": 50,
            "result_data": None,
        },
        headers=headers,
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["checked_by"] == "Анна Сергеевна"
