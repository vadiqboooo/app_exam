from app.database import transaction
from app.models import Student, StudyGroup


def seed(engine):
    with transaction(engine) as session:
        student = Student(full_name="Иванов Алексей", name_key="иванов алексей", grade=10)
        group = StudyGroup(source_name="Физика ПН 15:00")
        session.add_all([student, group])
        session.flush()
        return student.id, group.id


def test_admin_adds_and_removes_member_keeping_history(client, engine):
    student_id, group_id = seed(engine)

    created = client.post("/api/memberships", json={"student_id": student_id, "group_id": group_id})
    assert created.status_code == 200
    membership = created.json()
    assert membership["ended_at"] is None

    again = client.post("/api/memberships", json={"student_id": student_id, "group_id": group_id})
    assert again.json()["id"] == membership["id"]

    removed = client.delete(f"/api/memberships/{membership['id']}")
    assert removed.status_code == 200
    assert removed.json()["ended_at"] is not None

    rows = client.get("/api/memberships").json()
    assert [row["id"] for row in rows] == [membership["id"]]

    readded = client.post("/api/memberships", json={"student_id": student_id, "group_id": group_id})
    assert readded.json()["id"] != membership["id"]


def test_unknown_student_or_group_is_404(client, engine):
    student_id, group_id = seed(engine)
    assert (
        client.post("/api/memberships", json={"student_id": 999, "group_id": group_id}).status_code
        == 404
    )
    assert (
        client.post(
            "/api/memberships", json={"student_id": student_id, "group_id": 999}
        ).status_code
        == 404
    )


def test_members_cannot_be_changed_without_staff_key(client, engine):
    student_id, group_id = seed(engine)
    response = client.post(
        "/api/memberships",
        json={"student_id": student_id, "group_id": group_id},
        headers={"Authorization": "Bearer wrong"},
    )
    assert response.status_code == 401
