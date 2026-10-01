from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.database import transaction
from app.models import Exam, ExamEvent, ExamSlot, Participation, Student
from app.schemas.participation import Registration
from app.services.participation import register
from app.time import utcnow


def payload():
    starts = datetime.now(UTC) + timedelta(days=10)
    return {
        "title": "Осенний пробник",
        "schools": [
            {
                "name": "Школа № 1",
                "address": "Учебная, 1",
                "slots": [{"starts_at": starts.isoformat(), "capacity": 1}],
            },
            {
                "name": "Школа № 2",
                "slots": [
                    {
                        "starts_at": (starts + timedelta(days=1)).isoformat(),
                        "capacity": 2,
                    }
                ],
            },
        ],
        "subjects": [
            {
                "format": "ege",
                "subject": "Информатика",
            },
            {
                "format": "oge",
                "subject": "Математика",
            },
        ],
    }


def create(client, engine):
    with transaction(engine, write=True) as session:
        session.add_all(
            [
                Student(full_name="Иванов Иван", name_key="иванов иван", grade=11),
                Student(full_name="Петров Пётр", name_key="петров пётр", grade=9),
            ]
        )
    response = client.post("/api/exam-events", json=payload())
    assert response.status_code == 201, response.text
    exams = client.get("/api/exams").json()
    ege = next(e for e in exams if e["format"] == "ege")
    oge = next(e for e in exams if e["format"] == "oge")
    return ege, oge


def login(client, surname="Иванов", name="Иван"):
    response = client.post("/api/student/login", json={"last_name": surname, "first_name": name})
    assert response.status_code == 200
    return {"Authorization": "Bearer " + response.json()["token"]}


def edit_payload(ege, oge):
    schools = {}
    for slot in ege["slots"]:
        school = schools.setdefault(
            slot["school_id"],
            {
                "id": slot["school_id"],
                "name": slot["school_name"],
                "address": slot["school_address"],
                "slots": [],
            },
        )
        school["slots"].append(
            {
                "id": slot["id"],
                "starts_at": slot["starts_at"],
                "capacity": slot["capacity"],
            }
        )
    return {
        "title": ege["title"],
        "registration_open_at": ege["registration_open_at"],
        "registration_close_at": ege["registration_close_at"],
        "schools": list(schools.values()),
        "subjects": [
            {
                "id": exam["id"],
                "format": exam["format"],
                "subject": exam["subject"],
                "structure_data": exam["structure_data"],
            }
            for exam in (ege, oge)
        ],
    }


def test_create_event_schools_formats_and_live_counts(client, engine):
    ege, oge = create(client, engine)
    assert ege["event_id"] == oge["event_id"]
    assert ege["title"] == oge["title"] == "Осенний пробник"
    assert ege["subject"] != oge["subject"]
    assert len(ege["slots"]) == len(oge["slots"]) == 2
    assert [slot["id"] for slot in ege["slots"]] == [slot["id"] for slot in oge["slots"]]
    assert ege["slots"][0]["school_name"] == "Школа № 1"
    assert ege["slots"][0]["school_address"] == "Учебная, 1"
    assert ege["slots"][0]["remaining"] == 1
    headers = login(client)
    path = f"/api/student/exams/{ege['id']}/register"
    data = {"slot_id": ege["slots"][0]["id"]}
    response = client.post(path, headers=headers, json=data)
    assert response.status_code == 200
    assert response.json()["slot_id"] == data["slot_id"]
    assert client.post(path, headers=headers, json=data).json()["id"] == response.json()["id"]
    exam = client.get(f"/api/exams/{ege['id']}").json()
    assert exam["slots"][0]["booked"] == 1
    assert exam["slots"][0]["remaining"] == 0
    assert exam["slots"][1]["remaining"] == 2
    student_exams = client.get("/api/student/exams", headers=headers).json()
    assert next(e for e in student_exams if e["id"] == ege["id"])["slots"][0]["remaining"] == 0
    # The school/time quota is shared by every subject in the event.
    other = login(client, "Петров", "Пётр")
    assert (
        client.post(
            f"/api/student/exams/{oge['id']}/register",
            headers=other,
            json={"slot_id": oge["slots"][0]["id"]},
        ).status_code
        == 422
    )


def test_group_result_can_be_entered_without_a_portal_time_slot(client, engine):
    ege, _ = create(client, engine)
    response = client.post(
        "/api/participations/quick-result",
        json={
            "student_id": 1,
            "exam_id": ege["id"],
            "primary_score": 12,
            "test_score": 65,
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "checked"
    assert response.json()["slot_id"] is None


def test_slot_validation_capacity_conflicts_and_cancellation(client, engine):
    ege, oge = create(client, engine)
    first, second = ege["slots"]
    headers = login(client)
    path = f"/api/student/exams/{ege['id']}/register"
    for data in ({}, {"slot_id": 999}):
        assert client.post(path, headers=headers, json=data).status_code == 422
    response = client.post(path, headers=headers, json={"slot_id": first["id"]})
    item_id = response.json()["id"]
    assert client.post(path, headers=headers, json={"slot_id": second["id"]}).status_code == 422
    conflict = client.post(
        f"/api/student/exams/{oge['id']}/register",
        headers=headers,
        json={"slot_id": oge["slots"][0]["id"]},
    )
    assert conflict.status_code == 422 and "время" in conflict.json()["detail"]
    other = login(client, "Петров", "Пётр")
    assert client.post(path, headers=other, json={"slot_id": first["id"]}).status_code == 422
    # Operators cannot overbook either.
    assert (
        client.post(
            "/api/participations",
            json={
                "student_id": 2,
                "exam_id": ege["id"],
                "slot_id": first["id"],
            },
        ).status_code
        == 422
    )
    assert (
        client.patch(
            f"/api/participations/{item_id}/status", json={"status": "cancelled"}
        ).status_code
        == 200
    )
    assert client.get(f"/api/exams/{ege['id']}").json()["slots"][0]["remaining"] == 1
    assert client.post(path, headers=other, json={"slot_id": first["id"]}).status_code == 200
    # Reactivating a cancelled participation cannot bypass capacity.
    assert (
        client.patch(
            f"/api/participations/{item_id}/status", json={"status": "registered"}
        ).status_code
        == 422
    )
    assert client.post(path, headers=headers, json={"slot_id": first["id"]}).status_code == 422
    response = client.post(path, headers=headers, json={"slot_id": second["id"]})
    assert response.status_code == 200
    assert response.json()["id"] == item_id and response.json()["slot_id"] == second["id"]


def test_student_can_change_and_delete_own_registration(client, engine):
    ege, _ = create(client, engine)
    first, second = ege["slots"]
    headers = login(client)
    response = client.post(
        f"/api/student/exams/{ege['id']}/register",
        headers=headers,
        json={"slot_id": first["id"]},
    )
    assert response.status_code == 200
    item_id = response.json()["id"]

    response = client.patch(
        f"/api/student/participations/{item_id}",
        headers=headers,
        json={"slot_id": second["id"]},
    )
    assert response.status_code == 200
    assert response.json()["slot_id"] == second["id"]
    updated = client.get(f"/api/exams/{ege['id']}").json()
    assert updated["slots"][0]["remaining"] == first["capacity"]
    assert updated["slots"][1]["remaining"] == second["capacity"] - 1

    other = login(client, "Петров", "Пётр")
    assert (
        client.patch(
            f"/api/student/participations/{item_id}",
            headers=other,
            json={"slot_id": first["id"]},
        ).status_code
        == 404
    )
    assert client.delete(f"/api/student/participations/{item_id}", headers=other).status_code == 404

    response = client.delete(f"/api/student/participations/{item_id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    assert (
        client.get(f"/api/exams/{ege['id']}").json()["slots"][1]["remaining"] == second["capacity"]
    )


def test_later_slots_stay_available_after_first_date_and_window_is_enforced(client, engine):
    ege, _ = create(client, engine)
    with transaction(engine, write=True) as session:
        session.get(Exam, ege["id"]).starts_at = utcnow() - timedelta(days=1)
        session.get(ExamSlot, ege["slots"][0]["id"]).starts_at = utcnow() - timedelta(days=1)
    headers = login(client)
    assert any(
        e["id"] == ege["id"] for e in client.get("/api/student/exams", headers=headers).json()
    )
    path = f"/api/student/exams/{ege['id']}/register"
    assert (
        client.post(path, headers=headers, json={"slot_id": ege["slots"][0]["id"]}).status_code
        == 422
    )
    with transaction(engine, write=True) as session:
        session.get(Exam, ege["id"]).registration_open_at = utcnow() + timedelta(days=2)
    assert (
        client.post(path, headers=headers, json={"slot_id": ege["slots"][1]["id"]}).status_code
        == 422
    )
    with transaction(engine, write=True) as session:
        session.get(Exam, ege["id"]).registration_open_at = None
    assert (
        client.post(path, headers=headers, json={"slot_id": ege["slots"][1]["id"]}).status_code
        == 200
    )


def test_last_place_is_atomic_under_concurrent_registrations(client, engine):
    ege, _ = create(client, engine)

    def reserve(student_id):
        try:
            with transaction(engine, write=True) as session:
                register(
                    session,
                    Registration(
                        student_id=student_id, exam_id=ege["id"], slot_id=ege["slots"][0]["id"]
                    ),
                )
            return "registered"
        except ValueError:
            return "full"

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(reserve, [1, 2])) == ["full", "registered"]
    with transaction(engine) as session:
        assert session.scalar(select(func.count()).select_from(Participation)) == 1


def test_edit_event_preserves_ids_and_protects_booked_subject_and_slot(client, engine):
    ege, oge = create(client, engine)
    headers = login(client)
    response = client.post(
        f"/api/student/exams/{ege['id']}/register",
        headers=headers,
        json={"slot_id": ege["slots"][0]["id"]},
    )
    assert response.status_code == 200
    data = edit_payload(ege, oge)
    data["title"] = "Обновлённый пробник"
    data["schools"][0]["name"] = "Лицей № 1"
    data["schools"][0]["slots"][0]["capacity"] = 2
    response = client.put(f"/api/exam-events/{ege['event_id']}", json=data)
    assert response.status_code == 200, response.text
    assert response.json()["exam_ids"] == [ege["id"], oge["id"]]
    updated = client.get(f"/api/exams/{ege['id']}").json()
    assert updated["title"] == "Обновлённый пробник"
    assert updated["slots"][0]["school_name"] == "Лицей № 1"
    assert updated["slots"][0]["capacity"] == 2
    assert updated["slots"][0]["booked"] == 1

    without_booked_slot = deepcopy(data)
    without_booked_slot["schools"][0]["slots"] = []
    assert (
        client.put(f"/api/exam-events/{ege['event_id']}", json=without_booked_slot).status_code
        == 422
    )
    without_booked_subject = deepcopy(data)
    without_booked_subject["subjects"] = [without_booked_subject["subjects"][1]]
    assert (
        client.put(f"/api/exam-events/{ege['event_id']}", json=without_booked_subject).status_code
        == 422
    )


def test_delete_event_removes_schedule_subjects_and_results(client, engine):
    ege, _ = create(client, engine)
    headers = login(client)
    assert (
        client.post(
            f"/api/student/exams/{ege['id']}/register",
            headers=headers,
            json={"slot_id": ege["slots"][0]["id"]},
        ).status_code
        == 200
    )
    response = client.delete(f"/api/exam-events/{ege['event_id']}")
    assert response.status_code == 200 and response.json() == {"ok": True}
    with transaction(engine) as session:
        assert session.scalar(select(func.count()).select_from(ExamEvent)) == 0
        assert session.scalar(select(func.count()).select_from(Exam)) == 0
        assert session.scalar(select(func.count()).select_from(ExamSlot)) == 0
        assert session.scalar(select(func.count()).select_from(Participation)) == 0


@pytest.mark.parametrize(
    "invalid",
    [
        "title",
        "subjects",
        "schools",
        "capacity",
        "empty_schedule",
        "timezone",
        "past",
        "duplicate_slot",
        "duplicate_subject",
    ],
)
def test_invalid_event_creation_is_atomic(client, engine, invalid):
    data = deepcopy(payload())
    slot = data["schools"][0]["slots"][0]
    if invalid in {"title", "subjects", "schools"}:
        data[invalid] = " " if invalid == "title" else []
    elif invalid == "capacity":
        slot["capacity"] = 0
    elif invalid == "empty_schedule":
        data["schools"][0]["slots"] = []
    elif invalid == "timezone":
        slot["starts_at"] = "2030-01-01T10:00:00"
    elif invalid == "past":
        slot["starts_at"] = "2000-01-01T10:00:00Z"
    elif invalid == "duplicate_slot":
        data["schools"][0]["slots"].append(slot)
    else:
        data["subjects"].append(data["subjects"][0])
    response = client.post("/api/exam-events", json=data)
    assert response.status_code == 422, response.text
    with transaction(engine) as session:
        assert session.scalar(select(func.count()).select_from(ExamEvent)) == 0
        assert session.scalar(select(func.count()).select_from(Exam)) == 0


def test_draft_event_saves_partial_data_and_publishes_later(client):
    draft = {"title": "Черновик", "draft": True, "subjects": [{"format": "ege", "subject": "Физика"}]}
    created = client.post("/api/exam-events", json=draft)
    assert created.status_code == 201, created.text
    exams = client.get("/api/exams").json()
    assert [(e["title"], e["is_active"]) for e in exams] == [("Черновик", False)]

    incomplete = {**draft, "draft": False}
    assert client.post("/api/exam-events", json=incomplete).status_code == 422

    full = {**payload(), "title": "Черновик"}
    full["subjects"] = [{"id": created.json()["exam_ids"][0], "format": "ege", "subject": "Физика"}]
    published = client.put(f"/api/exam-events/{created.json()['id']}", json=full)
    assert published.status_code == 200, published.text
    assert client.get("/api/exams").json()[0]["is_active"] is True
