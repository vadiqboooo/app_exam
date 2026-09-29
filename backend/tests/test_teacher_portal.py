from io import BytesIO

from openpyxl import Workbook
from sqlalchemy import select

from app.database import transaction
from app.models import Staff, StudyGroup


def workbook(rows):
    book = Workbook()
    book.active.append(["ФИО", "Статус обучения", "Активные группы", "Класс обучения"])
    for row in rows:
        book.active.append(row)
    output = BytesIO()
    book.save(output)
    book.close()
    return output.getvalue()


def import_rows(client, rows):
    content = workbook(rows)
    files = {"file": ("crm.xlsx", content)}
    preview = client.post("/api/imports/preview", files=files)
    assert preview.status_code == 200, preview.text
    applied = client.post(
        "/api/imports/apply",
        files=files,
        data={"confirmation": preview.json()["confirmation"]},
    )
    assert applied.status_code == 200, applied.text
    return applied.json()


def teacher_headers(client, first_name, middle_name):
    response = client.post(
        "/api/teacher/login",
        json={"first_name": first_name, "middle_name": middle_name},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def test_crm_import_creates_teachers_and_assigns_groups(client, engine):
    result = import_rows(
        client,
        [
            ["Иванов Иван", "Обучается", "Физика ПН 15:00 Анна Сергеевна", 10],
            ["Петров Пётр", "Обучается", "Химия ВТ 16:00 Ольга Игоревна", 10],
        ],
    )
    assert result["report"]["new_teachers"] == 2
    assert {item["full_name"] for item in result["changes"]["new_teachers"]} == {
        "Анна Сергеевна",
        "Ольга Игоревна",
    }

    with transaction(engine) as session:
        teachers = list(session.scalars(select(Staff).where(Staff.role == "teacher")))
        groups = list(session.scalars(select(StudyGroup).order_by(StudyGroup.id)))
        assert {teacher.name for teacher in teachers} == {"Анна Сергеевна", "Ольга Игоревна"}
        assert all(group.teacher_id is not None for group in groups)


def test_crm_import_sets_group_exam_format(client, engine):
    import_rows(
        client,
        [
            ["Иванов Иван", "Обучается", "Информатика ЕГЭ ПН 15:00 Анна Сергеевна", 11],
            ["Петров Пётр", "Обучается", "Русский язык ОГЭ ВТ 16:00 Ольга Игоревна", 9],
        ],
    )
    groups = client.get("/api/groups").json()
    assert {group["exam_format"] for group in groups} == {"ege", "oge"}

    with transaction(engine) as session:
        stored = list(session.scalars(select(StudyGroup)))
        assert {group.exam_format for group in stored} == {"ege", "oge"}


def test_teacher_login_only_returns_own_groups_and_students(client):
    import_rows(
        client,
        [
            ["Иванов Иван", "Обучается", "Физика ПН 15:00 Анна Сергеевна", 10],
            ["Петров Пётр", "Обучается", "Химия ВТ 16:00 Ольга Игоревна", 10],
        ],
    )
    headers = teacher_headers(client, "  анна ", "СЕРГЕЕВНА")

    groups = client.get("/api/groups", headers=headers).json()
    students = client.get("/api/students", headers=headers).json()
    memberships = client.get("/api/memberships", headers=headers).json()

    assert [group["teacher_name"] for group in groups] == ["Анна Сергеевна"]
    assert [student["full_name"] for student in students] == ["Иванов Иван"]
    assert {membership["group_id"] for membership in memberships} == {groups[0]["id"]}
    assert client.get("/api/students/2", headers=headers).status_code == 404
    assert (
        client.post(
            "/api/imports/analyze",
            headers=headers,
            files={"file": ("crm.xlsx", workbook([]))},
        ).status_code
        == 403
    )


def test_unknown_teacher_cannot_login(client):
    response = client.post(
        "/api/teacher/login",
        json={"first_name": "Нет", "middle_name": "Такого"},
    )
    assert response.status_code == 422


def test_admin_can_manage_teachers_and_manual_groups_survive_import(client):
    rows = [
        ["Иванов Иван", "Обучается", "Физика ПН 15:00 Анна Сергеевна", 10],
        ["Петров Пётр", "Обучается", "Химия ВТ 16:00 Ольга Игоревна", 10],
    ]
    import_rows(client, rows)
    groups = client.get("/api/groups").json()
    teachers = client.get("/api/teachers").json()
    anna = next(teacher for teacher in teachers if teacher["name"] == "Анна Сергеевна")

    updated = client.put(
        f"/api/teachers/{anna['id']}",
        json={
            "first_name": "Елена",
            "middle_name": "Петровна",
            "group_ids": [group["id"] for group in groups],
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["name"] == "Елена Петровна"
    assert set(updated.json()["group_ids"]) == {group["id"] for group in groups}

    # CRM-derived names must not overwrite an explicit administrator assignment.
    import_rows(client, rows)
    assert {group["teacher_name"] for group in client.get("/api/groups").json()} == {
        "Елена Петровна"
    }
    headers = teacher_headers(client, "Елена", "Петровна")
    assert client.get("/api/teachers", headers=headers).status_code == 403

    deleted = client.delete(f"/api/teachers/{anna['id']}")
    assert deleted.status_code == 200
    unassigned = client.get("/api/groups").json()
    assert all(group["teacher_id"] is None for group in unassigned)
    assert all(group["teacher_name"] is None for group in unassigned)


def test_admin_can_create_teacher_and_duplicate_name_is_rejected(client):
    created = client.post(
        "/api/teachers",
        json={"first_name": "Мария", "middle_name": "Ивановна", "group_ids": []},
    )
    assert created.status_code == 201, created.text
    duplicate = client.post(
        "/api/teachers",
        json={"first_name": " мария ", "middle_name": "ИВАНОВНА", "group_ids": []},
    )
    assert duplicate.status_code == 422
