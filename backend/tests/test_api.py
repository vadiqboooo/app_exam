import json
from datetime import UTC, datetime, timedelta
from io import BytesIO

import pytest
from openpyxl import Workbook


def workbook(rows):
    book = Workbook()
    book.active.append(["ФИО", "Статус обучения", "Активные группы", "Класс обучения", "ID"])
    for row in rows:
        book.active.append(row)
    output = BytesIO()
    book.save(output)
    book.close()
    return output.getvalue()


def import_rows(client, rows, grades=None):
    files = {"file": ("crm.xlsx", workbook(rows))}
    data = {"grades": json.dumps(grades)} if grades is not None else {}
    preview = client.post("/api/imports/preview", files=files, data=data)
    assert preview.status_code == 200, preview.text
    result = client.post(
        "/api/imports/apply",
        files=files,
        data={**data, "confirmation": preview.json()["confirmation"]},
    )
    assert result.status_code == 200, result.text
    return result.json()


def test_import_analysis_counts_grades_without_writing(client):
    rows = [
        ["Иванов Иван", "Обучается", "Физика", 11],
        ["Петров Пётр", "Архив", "Физика", 11],
        ["Сидорова Анна", "Обучается", "Математика", 9],
        ["Орлова Ольга", "Обучается", "Химия", None],
    ]
    response = client.post("/api/imports/analyze", files={"file": ("crm.xlsx", workbook(rows))})
    assert response.status_code == 200
    assert response.json() == {
        "total": 4,
        "grades": [
            {"grade": 9, "count": 1},
            {"grade": 11, "count": 2},
            {"grade": None, "count": 1},
        ],
    }
    assert client.get("/api/students").json() == []
    assert client.get("/api/groups").json() == []


def test_selected_import_preserves_other_grades_and_archives_missing_selected(client):
    original = [
        ["Иванов Иван", "Обучается", "Физика", 11, "one"],
        ["Петров Пётр", "Обучается", "Химия", 9, "two"],
        ["Орлова Ольга", "Обучается", "История", None, "three"],
        ["Сидоров Сидор", "Обучается", "Биология", 11, "four"],
        ["Крылов Кирилл", "Обучается", "Литература", 11, "five"],
    ]
    import_rows(client, original)
    before = client.get("/api/memberships").json()
    rows = [
        ["Иванов Иван", "Обучается", "Математика", 11, "one"],
        ["Новый Ученик", "Обучается", "Математика", 11, "six"],
        ["Другой Ученик", "Обучается", "География", 9, "seven"],
        # A pupil moved OUT of the selection in CRM must not be archived using the old grade.
        ["Крылов Кирилл", "Архив", "Литература", 9, "five"],
    ]
    report = import_rows(client, rows, grades=[11])["report"]
    assert report["total"] == 2
    assert report["new"] == 1
    assert report["left"] == 1
    students = {s["external_id"]: s for s in client.get("/api/students").json()}
    assert "seven" not in students
    assert students["six"]["is_active"]
    assert not students["four"]["is_active"]
    memberships = client.get("/api/memberships").json()
    for identity in ("two", "three", "five"):
        student = students[identity]
        assert student["is_active"]
        assert [m for m in memberships if m["student_id"] == student["id"]] == [
            m for m in before if m["student_id"] == student["id"]
        ]
    assert students["five"]["grade"] == 11
    groups = client.get("/api/groups").json()
    assert all(
        g["is_active"] for g in groups if g["source_name"] in {"Химия", "История", "Литература"}
    )
    report = import_rows(client, rows, grades=[11])["report"]
    assert report["unchanged"] == 2
    assert report["new"] == report["left"] == report["memberships_added"] == 0


def test_selected_import_supports_unknown_grade_and_grade_changes(client):
    import_rows(client, [["Иванов Иван", "Обучается", "Физика", 9, "one"]])
    rows = [
        ["Иванов Иван", "Обучается", "Химия", 11, "one"],
        ["Орлова Ольга", "Обучается", "История", None, "two"],
        ["Другой Ученик", "Обучается", "География", 9, "three"],
    ]
    report = import_rows(client, rows, grades=[None, 11])["report"]
    assert report["total"] == 2
    students = {s["external_id"]: s for s in client.get("/api/students").json()}
    assert set(students) == {"one", "two"}
    assert students["one"]["grade"] == 11
    assert students["two"]["grade"] is None


@pytest.mark.parametrize("grades", ["[]", "[0]", "[12]", '["11"]', "[true]", "null", "bad", "[9]"])
def test_invalid_or_empty_grade_selection_does_not_write(client, grades):
    files = {"file": ("crm.xlsx", workbook([["Иванов Иван", "Обучается", "Физика", 11]]))}
    for endpoint in ("preview", "apply"):
        response = client.post(
            f"/api/imports/{endpoint}",
            files=files,
            data={"grades": grades, "confirmation": "x" * 64},
        )
        assert response.status_code == 422
    assert client.get("/api/students").json() == []


@pytest.mark.parametrize("changed_grades", [None, [9, 11]])
def test_import_confirmation_binds_grade_selection_even_with_same_rows(client, changed_grades):
    files = {"file": ("crm.xlsx", workbook([["Иванов Иван", "Обучается", "Физика", 11]]))}
    preview = client.post("/api/imports/preview", files=files, data={"grades": "[11]"})
    assert preview.status_code == 200
    data = {"confirmation": preview.json()["confirmation"]}
    if changed_grades is not None:
        data["grades"] = json.dumps(changed_grades)
    response = client.post("/api/imports/apply", files=files, data=data)
    assert response.status_code == 422
    assert "изменились" in response.json()["detail"]
    assert client.get("/api/students").json() == []


def exam(client, exam_type="mock"):
    result = client.post(
        "/api/exams",
        json={
            "type": exam_type,
            "subject": "Информатика",
            "starts_at": "2026-10-01T15:00:00+08:00",
            "structure_data": {
                "version": 1,
                "tasks": [
                    {"code": "1", "title": "Задание 1", "max_score": 1},
                    {"code": "К1", "title": "Критерий 1", "max_score": 2},
                ],
            },
        },
    )
    assert result.status_code == 201, result.text
    assert result.json()["starts_at"] == "2026-10-01T07:00:00Z"
    return result.json()["id"]


def test_full_exam_and_history_survives_crm_import(client):
    row = ["Иванов Алексей", "Обучается", "Физика;Информатика", 11, "crm-1"]
    import_rows(client, [row])
    student = client.get("/api/students").json()[0]
    assert "access_code_hash" not in student
    for exam_type in ("mock", "ege"):
        exam_id = exam(client, exam_type)
        registration = {"student_id": student["id"], "exam_id": exam_id}
        response = client.post("/api/participations", json=registration)
        assert response.status_code == 201, response.text
        item_id = response.json()["id"]
        assert client.post("/api/participations", json=registration).status_code == 409
        path = f"/api/participations/{item_id}"
        assert client.patch(path + "/status", json={"status": "published"}).status_code == 422
        for status in ("attended", "submitted"):
            assert client.patch(path + "/status", json={"status": status}).status_code == 200
        assert client.patch(path + "/status", json={"status": "checked"}).status_code == 422
        result = {
            "primary_score": 2,
            "test_score": 72,
            "result_data": {
                "version": 1,
                "tasks": [
                    {"code": "1", "score": 0, "comment": "Ошибка"},
                    {"code": "К1", "score": 2, "comment": "Верно"},
                ],
                "overall_comment": "Повторить первое задание",
            },
        }
        assert client.put(path + "/result", json=result).status_code == 200
        for status in ("checked", "published"):
            response = client.patch(path + "/status", json={"status": status})
            assert response.status_code == 200, response.text
        assert response.json()["published_at"] is not None
        assert client.put(path + "/result", json=result).status_code == 422
    import_rows(client, [["Петров Иван", "Обучается", "Физика", 10, "crm-2"]])
    assert not client.get(f"/api/students/{student['id']}").json()["is_active"]
    report = import_rows(client, [row])["report"]
    assert report["returned"] == 1 and report["left"] == 1
    history = client.get("/api/participations", params={"student_id": student["id"]}).json()
    assert len(history) == 2
    assert all(p["test_score"] == 72 and p["status"] == "published" for p in history)
    memberships = client.get(f"/api/students/{student['id']}/memberships").json()
    assert len(memberships) == 4


def test_auth_and_validation(client):
    assert client.get("/health").status_code == 200
    assert client.get("/api/students", headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.get("/api/students", params={"limit": 10000}).status_code == 422
    assert client.get("/api/students/999").status_code == 404
    assert (
        client.post(
            "/api/exams",
            json={"type": "mock", "subject": "Физика", "starts_at": "2026-10-01T12:00:00"},
        ).status_code
        == 422
    )
    assert (
        client.post("/api/imports/preview", files={"file": ("bad.xlsx", b"bad")}).status_code == 422
    )
    assert (
        client.post(
            "/api/imports/preview",
            files={"file": ("bad.xlsx", workbook([["Иванов Иван", "неизвестно", "Физика", 10]]))},
        ).status_code
        == 422
    )
    assert client.get("/api/students").json() == []


def test_comma_separated_groups_share_memberships_and_reimport_is_idempotent(client):
    biology = "Биология ЕГЭ ПН, СБ 15:00 Рымарева Екатерина"
    rows = [
        ["Иванов Иван", "Активен", f"Физика,{biology},Математика", 11],
        ["Петров Пётр", "Активен", f"{biology.replace(', ', ' и ')},Физика", 11],
    ]
    report = import_rows(client, rows)["report"]
    assert report["new_groups"] == 3
    assert report["memberships_added"] == 5
    groups = {g["id"]: g["source_name"] for g in client.get("/api/groups").json()}
    students = client.get("/api/students").json()
    for student in students:
        memberships = client.get(f"/api/students/{student['id']}/memberships").json()
        expected = {biology.replace(", ", "-"), "Физика"}
        if student["full_name"] == "Иванов Иван":
            expected.add("Математика")
        assert {groups[m["group_id"]] for m in memberships} == expected
        assert all(m["ended_at"] is None for m in memberships)
    report = import_rows(client, rows)["report"]
    assert report["unchanged"] == 2
    assert report["new_groups"] == report["memberships_added"] == 0
    assert report["memberships_closed"] == 0


def test_result_validation(client):
    import_rows(client, [["Иванов Иван", "Обучается", "Физика", 10]])
    exam_id = exam(client)
    item = client.post("/api/participations", json={"student_id": 1, "exam_id": exam_id}).json()
    path = f"/api/participations/{item['id']}"
    for status in ("attended", "submitted"):
        client.patch(path + "/status", json={"status": status})
    invalid_results = [
        {"primary_score": -1},
        {"primary_score": 4},
        {"primary_score": 2, "result_data": {"tasks": [{"code": "unknown", "score": 2}]}},
        {
            "primary_score": 2,
            "result_data": {"tasks": [{"code": "1", "score": 2}, {"code": "К1", "score": 0}]},
        },
        {
            "primary_score": 2,
            "result_data": {"tasks": [{"code": "1", "score": 0}, {"code": "К1", "score": 0}]},
        },
        {
            "primary_score": 2,
            "result_data": {"tasks": [{"code": "1", "score": 1}, {"code": "1", "score": 1}]},
        },
    ]
    for payload in invalid_results:
        assert client.put(path + "/result", json=payload).status_code == 422
    assert client.get("/api/participations").json()[0]["primary_score"] is None


def test_quick_result_creates_checked_participation_and_updates_it(client):
    import_rows(client, [["Иванов Иван", "Обучается", "Физика", 10]])
    exam_id = exam(client)
    payload = {
        "student_id": 1,
        "exam_id": exam_id,
        "primary_score": 2,
        "test_score": 72,
        "result_data": {
            "tasks": [
                {"code": "1", "score": 0, "comment": ""},
                {"code": "К1", "score": 2, "comment": "Верно"},
            ],
            "overall_comment": "Хорошая работа",
        },
    }
    created = client.post("/api/participations/quick-result", json=payload)
    assert created.status_code == 200, created.text
    assert created.json()["status"] == "checked"
    assert created.json()["test_score"] == 72

    payload["test_score"] = 74
    updated = client.post("/api/participations/quick-result", json=payload)
    assert updated.status_code == 200, updated.text
    assert updated.json()["id"] == created.json()["id"]
    assert updated.json()["test_score"] == 74

    path = f"/api/participations/{created.json()['id']}"
    assert client.patch(path + "/status", json={"status": "published"}).status_code == 200
    rejected = client.post("/api/participations/quick-result", json=payload)
    assert rejected.status_code == 422
    assert "Опубликованный" in rejected.json()["detail"]


def test_exam_result_is_calculated_from_subject_scale(client):
    import_rows(client, [["Иванов Иван", "Обучается", "Информатика", 9]])
    starts = datetime.now(UTC) + timedelta(days=10)
    created = client.post(
        "/api/exam-events",
        json={
            "title": "Пробник со шкалами",
            "schools": [
                {
                    "name": "Школа № 1",
                    "slots": [{"starts_at": starts.isoformat(), "capacity": 20}],
                }
            ],
            "subjects": [
                {"format": "ege", "subject": "Информатика"},
                {"format": "oge", "subject": "Информатика"},
            ],
        },
    )
    assert created.status_code == 201, created.text
    exams = {
        item["format"]: item
        for item in client.get("/api/exams").json()
        if item["id"] in created.json()["exam_ids"]
    }

    def payload(exam, primary):
        remaining = primary
        results = []
        for task in exam["structure_data"]["tasks"]:
            task_score = min(remaining, task["max_score"])
            remaining -= task_score
            results.append({"code": task["code"], "score": task_score})
        assert remaining == 0
        return {
            "student_id": 1,
            "exam_id": exam["id"],
            "primary_score": primary,
            "test_score": 99,
            "result_data": {"tasks": results},
        }

    ege = client.post("/api/participations/quick-result", json=payload(exams["ege"], 2))
    oge = client.post("/api/participations/quick-result", json=payload(exams["oge"], 5))
    assert ege.status_code == oge.status_code == 200
    assert ege.json()["test_score"] == 14
    assert oge.json()["test_score"] == 3
