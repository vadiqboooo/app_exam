from datetime import UTC, datetime, timedelta

from tests.test_teacher_outside_students import import_rows


def subject_payload(max_scores=(1, 2), name="Астрономия"):
    return {
        "name": name,
        "format": "ege",
        "tasks": [
            {
                "code": str(index + 1),
                "title": f"Задание {index + 1}",
                "max_score": score,
            }
            for index, score in enumerate(max_scores)
        ],
        "is_active": True,
    }


def event_payload():
    starts = datetime.now(UTC) + timedelta(days=10)
    return {
        "title": "Пробник по информатике",
        "schools": [
            {
                "name": "Школа № 1",
                "slots": [{"starts_at": starts.isoformat(), "capacity": 20}],
            }
        ],
        "subjects": [{"format": "ege", "subject": "Информатика"}],
    }


def test_subject_settings_crud_and_totals(client):
    response = client.post("/api/subjects", json=subject_payload())
    assert response.status_code == 201, response.text
    subject = response.json()
    assert subject["tasks"][1]["max_score"] == 2
    assert subject["max_primary_score"] == 3

    duplicate = subject_payload()
    duplicate["name"] = "  АСТРОНОМИЯ  "
    assert client.post("/api/subjects", json=duplicate).status_code == 422

    updated = subject_payload((2, 3, 4))
    updated["is_active"] = False
    response = client.put(f"/api/subjects/{subject['id']}", json=updated)
    assert response.status_code == 200, response.text
    assert response.json()["max_primary_score"] == 9
    assert response.json()["is_active"] is False

    assert client.delete(f"/api/subjects/{subject['id']}").json() == {"ok": True}
    assert subject["id"] not in {item["id"] for item in client.get("/api/subjects").json()}


def test_existing_event_exam_uses_updated_subject_structure(client):
    configured = subject_payload((1, 3), "Информатика")
    subject = next(
        item
        for item in client.get("/api/subjects").json()
        if item["name"] == "Информатика" and item["format"] == "ege"
    )
    assert client.put(f"/api/subjects/{subject['id']}", json=configured).status_code == 200

    response = client.post("/api/exam-events", json=event_payload())
    assert response.status_code == 201, response.text
    exam_id = response.json()["exam_ids"][0]
    exam = client.get(f"/api/exams/{exam_id}").json()
    assert exam["structure_data"] == {
        "version": 1,
        "tasks": configured["tasks"],
        "primary_to_secondary_scale": None,
        "grade_scale": None,
    }

    changed = subject_payload((5,), "Информатика")
    changed["primary_to_secondary_scale"] = [0, 1, 2, 3, 4, 80]
    assert client.put(f"/api/subjects/{subject['id']}", json=changed).status_code == 200

    # Result-entry forms and server-side validation use the current settings.
    exam = client.get(f"/api/exams/{exam_id}").json()
    assert [task["max_score"] for task in exam["structure_data"]["tasks"]] == [5]
    assert (
        exam["structure_data"]["primary_to_secondary_scale"]
        == changed["primary_to_secondary_scale"]
    )

    import_rows(client, [["Иванов Иван", "Обучается", "Информатика", 10]])
    result = client.post(
        "/api/participations/quick-result",
        json={
            "student_id": 1,
            "exam_id": exam_id,
            "primary_score": 5,
            "result_data": {"tasks": [{"code": "1", "score": 5}]},
        },
    )
    assert result.status_code == 200, result.text
    assert result.json()["primary_score"] == 5
    assert result.json()["test_score"] == 80


def test_inactive_subject_is_not_used_as_a_template(client):
    configured = subject_payload(name="Информатика")
    configured["is_active"] = False
    subject = next(
        item
        for item in client.get("/api/subjects").json()
        if item["name"] == "Информатика" and item["format"] == "ege"
    )
    assert client.put(f"/api/subjects/{subject['id']}", json=configured).status_code == 200
    response = client.post("/api/exam-events", json=event_payload())
    assert response.status_code == 201, response.text
    exam = client.get(f"/api/exams/{response.json()['exam_ids'][0]}").json()
    assert exam["structure_data"] is None


def test_subject_task_maximum_must_be_positive(client):
    configured = subject_payload((0,))
    response = client.post("/api/subjects", json=configured)
    assert response.status_code == 422


def test_all_extracted_subject_settings_are_seeded(client):
    subjects = client.get("/api/subjects").json()
    assert len(subjects) == 20
    summary = {
        (item["name"], item["format"]): (
            len(item["tasks"]),
            item["max_primary_score"],
        )
        for item in subjects
    }
    assert summary[("Информатика", "ege")] == (27, 29)
    assert summary[("Русский язык", "ege")] == (27, 50)
    assert summary[("Математика (профильная)", "ege")] == (19, 34)
    assert summary[("История", "oge")] == (32, 80)
    assert summary[("Английский язык", "ege")] == (42, 82)
