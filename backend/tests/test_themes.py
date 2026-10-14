from datetime import UTC, datetime, timedelta


def event_payload(theme_key="halloween"):
    starts = datetime.now(UTC) + timedelta(days=10)
    return {
        "title": "Тематический пробник",
        "theme_key": theme_key,
        "schools": [
            {
                "name": "Школа № 1",
                "slots": [{"starts_at": starts.isoformat(), "capacity": 20}],
            }
        ],
        "subjects": [{"format": "ege", "subject": "Информатика"}],
    }


def test_theme_is_enabled_by_an_active_exam_event(client):
    public = client.get("/api/theme-settings", headers={"Authorization": ""})
    assert public.status_code == 200, public.text
    assert public.json() == {"enabled": []}

    listed = client.get("/api/themes")
    assert listed.status_code == 200, listed.text
    assert listed.json() == [
        {"key": "halloween", "title": "Хэллоуин", "is_enabled": True}
    ]

    created = client.post("/api/exam-events", json=event_payload())
    assert created.status_code == 201, created.text
    assert created.json()["theme_key"] == "halloween"
    assert client.get("/api/theme-settings", headers={"Authorization": ""}).json() == {
        "enabled": ["halloween"]
    }

    exam = client.get("/api/exams").json()[0]
    slot = exam["slots"][0]
    edit = event_payload(None)
    edit["subjects"][0]["id"] = exam["id"]
    edit["schools"] = [
        {
            "id": slot["school_id"],
            "name": slot["school_name"],
            "address": slot["school_address"],
            "slots": [
                {
                    "id": slot["id"],
                    "starts_at": slot["starts_at"],
                    "capacity": slot["capacity"],
                }
            ],
        }
    ]
    updated = client.put(f"/api/exam-events/{created.json()['id']}", json=edit)
    assert updated.status_code == 200, updated.text
    assert updated.json()["theme_key"] is None
    assert client.get("/api/theme-settings", headers={"Authorization": ""}).json() == {
        "enabled": []
    }


def test_unknown_theme_cannot_be_selected(client):
    response = client.post("/api/exam-events", json=event_payload("unknown"))
    assert response.status_code == 422


def test_theme_catalog_requires_authentication(client):
    response = client.get("/api/themes", headers={"Authorization": ""})
    assert response.status_code == 401
