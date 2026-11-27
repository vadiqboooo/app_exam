from io import BytesIO

from openpyxl import Workbook

from app.database import transaction
from app.models import Exam
from app.time import utcnow


def import_rows(client, rows):
    book = Workbook()
    book.active.append(["ФИО", "Статус обучения", "Активные группы", "Класс обучения"])
    for row in rows:
        book.active.append(row)
    output = BytesIO()
    book.save(output)
    files = {"file": ("crm.xlsx", output.getvalue())}
    preview = client.post("/api/imports/preview", files=files)
    assert preview.status_code == 200, preview.text
    applied = client.post(
        "/api/imports/apply", files=files, data={"confirmation": preview.json()["confirmation"]}
    )
    assert applied.status_code == 200, applied.text


def teacher_headers(client, last_name, first_name):
    response = client.post(
        "/api/teacher/login",
        json={"last_name": last_name, "first_name": first_name, "code": "123456"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def make_exam(engine, subject):
    with transaction(engine, write=True) as session:
        exam = Exam(type="mock", subject=subject, starts_at=utcnow(), is_active=True)
        session.add(exam)
        session.flush()
        return exam.id


def setup(client, engine):
    import_rows(
        client,
        [
            ["Иванов Иван", "Обучается", "Физика ПН 15:00 Анна Сергеевна", 10],
            ["Петров Пётр", "Обучается", "Химия ВТ 16:00 Ольга Игоревна", 11],
        ],
    )
    students = {s["full_name"]: s["id"] for s in client.get("/api/students").json()}
    return (
        teacher_headers(client, "Анна", "Сергеевна"),
        students,
        make_exam(engine, "Физика"),
        make_exam(engine, "Химия"),
    )


def result(student_id, exam_id):
    return {
        "student_id": student_id,
        "exam_id": exam_id,
        "primary_score": 5,
        "test_score": 50,
        "result_data": None,
    }


def test_teacher_finds_pupils_of_other_groups_with_their_group_and_teacher(client, engine):
    headers, students, _, _ = setup(client, engine)
    own = client.get("/api/students", headers=headers).json()
    assert [s["full_name"] for s in own] == ["Иванов Иван"]

    found = client.get("/api/students/search", params={"q": "петр"}, headers=headers)
    assert found.status_code == 200, found.text
    assert [s["full_name"] for s in found.json()] == ["Петров Пётр"]
    assert found.json()[0]["groups"][0]["teacher_name"] == "Ольга Игоревна"
    assert client.get("/api/students/search", params={"q": ""}, headers=headers).json() == []
    assert client.get("/api/students/search", params={"q": "иванов"}).status_code == 200


def test_search_reports_status_of_the_work_on_the_chosen_exam(client, engine):
    headers, students, physics, _ = setup(client, engine)
    params = {"q": "петров", "exam_id": physics}
    assert (
        client.get("/api/students/search", params=params, headers=headers).json()[0]["status"]
        is None
    )

    client.post(
        "/api/participations/quick-result",
        json=result(students["Петров Пётр"], physics),
        headers=headers,
    )
    assert (
        client.get("/api/students/search", params=params, headers=headers).json()[0]["status"]
        == "checked"
    )


def test_teacher_checks_pupil_of_another_group_only_on_their_subject(client, engine):
    headers, students, physics, chemistry = setup(client, engine)
    outsider = students["Петров Пётр"]

    saved = client.post(
        "/api/participations/quick-result", json=result(outsider, physics), headers=headers
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["checked_by"] == "Анна Сергеевна"
    assert saved.json()["status"] == "checked"

    denied = client.post(
        "/api/participations/quick-result", json=result(outsider, chemistry), headers=headers
    )
    assert denied.status_code == 404


def test_teacher_keeps_seeing_and_publishing_work_they_entered(client, engine):
    headers, students, physics, _ = setup(client, engine)
    outsider = students["Петров Пётр"]
    saved = client.post(
        "/api/participations/quick-result", json=result(outsider, physics), headers=headers
    ).json()

    assert outsider in [s["id"] for s in client.get("/api/students", headers=headers).json()]
    listed = client.get("/api/participations", headers=headers).json()
    assert [p["id"] for p in listed] == [saved["id"]]

    published = client.post(
        f"/api/participations/{saved['id']}/publish",
        json={"primary_score": 5, "test_score": 50, "result_data": None},
        headers=headers,
    )
    assert published.status_code == 200, published.text
    assert published.json()["status"] == "published"


def test_only_admin_can_reopen_a_published_work_for_teacher_correction(client, engine):
    headers, students, physics, _ = setup(client, engine)
    payload = result(students["Иванов Иван"], physics)
    saved = client.post("/api/participations/quick-result", json=payload, headers=headers).json()
    path = f"/api/participations/{saved['id']}"
    scores = {"primary_score": 5, "test_score": 50, "result_data": None}
    published = client.post(path + "/publish", json=scores, headers=headers)
    assert published.status_code == 200, published.text
    assert published.json()["published_at"] is not None

    assert client.post(path + "/unpublish", headers=headers).status_code == 403
    assert (
        client.patch(path + "/status", json={"status": "checked"}, headers=headers).status_code
        == 422
    )

    reopened = client.post(path + "/unpublish")
    assert reopened.status_code == 200, reopened.text
    assert reopened.json()["status"] == "checked"
    assert reopened.json()["published_at"] is None
    assert reopened.json()["primary_score"] == 5
    assert reopened.json()["checked_by"] == "Анна Сергеевна"
    assert client.post(path + "/unpublish").status_code == 422

    payload["primary_score"] = 6
    corrected = client.post("/api/participations/quick-result", json=payload, headers=headers)
    assert corrected.status_code == 200, corrected.text
    assert corrected.json()["primary_score"] == 6
    assert corrected.json()["status"] == "checked"
    scores["primary_score"] = 6
    republished = client.post(path + "/publish", json=scores, headers=headers)
    assert republished.status_code == 200, republished.text
    assert republished.json()["status"] == "published"
    assert republished.json()["published_at"] is not None
