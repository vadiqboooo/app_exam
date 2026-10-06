from app.database import transaction
from app.models import Exam, ExamEvent
from app.time import utcnow
from tests.test_teacher_outside_students import import_rows, teacher_headers

TASKS = {"tasks": [{"code": code, "max_score": 1} for code in ("1", "2", "13", "13.1")]}


def make_exam(engine, subject, event_id=None, structure=TASKS):
    with transaction(engine, write=True) as session:
        exam = Exam(
            event_id=event_id,
            type="mock",
            format="ege",
            subject=subject,
            starts_at=utcnow(),
            is_active=True,
            structure_data=structure,
        )
        session.add(exam)
        session.flush()
        return exam.id


def setup(client):
    import_rows(
        client,
        [
            ["Иванов Иван", "Обучается", "Физика ПН 15:00 Анна Сергеевна", 10],
            ["Петров Пётр", "Обучается", "Химия ВТ 16:00 Ольга Игоревна", 11],
        ],
    )
    groups = {g["subject"]: g["id"] for g in client.get("/api/groups").json()}
    return groups["Физика"], groups["Химия"], teacher_headers(client, "Анна", "Сергеевна")


def save(client, group, exam, codes, headers=None):
    return client.put(
        f"/api/groups/{group}/coverage/{exam}", json={"task_codes": codes}, headers=headers
    )


def test_coverage_is_saved_in_exam_order_and_listed_with_the_group(client, engine):
    physics, _, _ = setup(client)
    exam = make_exam(engine, "Физика")

    saved = save(client, physics, exam, ["13.1", "1", "1", "2"])
    assert saved.status_code == 200, saved.text
    assert saved.json() == {"exam_id": exam, "task_codes": ["1", "2", "13.1"]}
    group = next(g for g in client.get("/api/groups").json() if g["id"] == physics)
    assert group["coverage"] == [{"exam_id": exam, "task_codes": ["1", "2", "13.1"]}]

    assert save(client, physics, exam, []).json()["task_codes"] == []
    group = next(g for g in client.get("/api/groups").json() if g["id"] == physics)
    assert group["coverage"] == []


def test_every_exam_has_its_own_marks(client, engine):
    physics, _, _ = setup(client)
    autumn, winter = make_exam(engine, "Физика"), make_exam(engine, "Физика")
    save(client, physics, autumn, ["1", "2"])
    save(client, physics, winter, ["13"])

    group = next(g for g in client.get("/api/groups").json() if g["id"] == physics)
    assert {c["exam_id"]: c["task_codes"] for c in group["coverage"]} == {
        autumn: ["1", "2"],
        winter: ["13"],
    }


def test_tasks_come_from_the_subject_settings_when_the_exam_has_no_own_structure(client, engine):
    physics, _, _ = setup(client)
    exam = make_exam(engine, "Информатика", structure=None)
    saved = save(client, physics, exam, ["1", "2"])
    assert saved.status_code == 200, saved.text
    assert saved.json()["task_codes"] == ["1", "2"]


def test_unknown_tasks_and_missing_things_are_rejected(client, engine):
    physics, _, _ = setup(client)
    exam = make_exam(engine, "Физика")
    assert save(client, physics, exam, ["99"]).status_code == 422
    assert save(client, physics, 9999, ["1"]).status_code == 404
    assert save(client, 9999, exam, ["1"]).status_code == 404


def test_a_teacher_marks_only_the_own_group(client, engine):
    physics, chemistry, anna = setup(client)
    exam = make_exam(engine, "Физика")
    assert save(client, physics, exam, ["1"], anna).status_code == 200
    denied = save(client, chemistry, exam, ["1"], anna)
    assert denied.status_code == 403
    # A teacher never even sees the groups of colleagues.
    assert [g["id"] for g in client.get("/api/groups", headers=anna).json()] == [physics]


def test_deleting_the_event_removes_the_marks(client, engine):
    physics, _, _ = setup(client)
    with transaction(engine, write=True) as session:
        event = ExamEvent(title="Осень")
        session.add(event)
        session.flush()
        event_id = event.id
    exam = make_exam(engine, "Физика", event_id)
    save(client, physics, exam, ["1"])

    assert client.delete(f"/api/exam-events/{event_id}").status_code == 200
    group = next(g for g in client.get("/api/groups").json() if g["id"] == physics)
    assert group["coverage"] == []
