from tests.test_training import _teacher


def test_teacher_sees_published_topics_without_answers_and_admin_manages_them(client):
    headers = _teacher(client)
    public = client.get("/api/training/topics", headers=headers)
    assert public.status_code == 200, public.text
    assert [topic["title"] for topic in public.json()] == ["Пробный урок"]
    assert "answer" not in public.json()[0]["questions"][0]
    assert client.get("/api/training/admin/topics", headers=headers).status_code == 403

    admin = client.get("/api/training/admin/topics")
    assert len(admin.json()) == 7
    assert admin.json()[0]["questions"][0]["answer"] == [0]

    body = {
        "title": "Новая тема", "description": "Описание", "position": 8,
        "video_url": "https://example.com/lesson.mp4", "material_text": "Прочитайте инструкцию",
        "published": True, "pass_percent": 100,
        "questions": [
            {"prompt": "Один", "kind": "single", "options": ["Да", "Нет"], "answer": [0]},
            {"prompt": "Несколько", "kind": "multiple", "options": ["А", "Б", "В"], "answer": [0, 2]},
            {"prompt": "Впишите", "kind": "text", "options": [], "answer": "Верно"},
        ],
    }
    created = client.post("/api/training/admin/topics", json=body)
    assert created.status_code == 201, created.text
    topic_id = created.json()["id"]
    assert client.put(f"/api/training/admin/topics/{topic_id}", json=body, headers=headers).status_code == 403
    teacher_topic = next(topic for topic in client.get("/api/training/topics", headers=headers).json() if topic["id"] == topic_id)
    assert all("answer" not in question for question in teacher_topic["questions"])
    question_ids = [question["id"] for question in teacher_topic["questions"]]

    invalid = client.post(f"/api/training/topics/{topic_id}/attempts", json={"answers": {str(question_ids[0]): [0]}}, headers=headers)
    assert invalid.status_code == 422
    attempt = client.post(
        f"/api/training/topics/{topic_id}/attempts",
        json={"answers": {str(question_ids[0]): [0], str(question_ids[1]): [2, 0], str(question_ids[2]): "  ВЕРНО  "}},
        headers=headers,
    )
    assert attempt.status_code == 200, attempt.text
    assert attempt.json()["score"] == 3
    assert not attempt.json()["topic"]["progress"]["passed"]
    progress = client.patch(f"/api/training/topics/{topic_id}/progress", json={"video_percent": 90, "video_position_seconds": 42, "material_read": True}, headers=headers)
    assert progress.status_code == 200, progress.text
    assert progress.json()["progress"]["passed"]
    assert progress.json()["progress"]["completed_at"]
    assert progress.json()["progress"]["video_position_seconds"] == 42
    reloaded = next(topic for topic in client.get("/api/training/topics", headers=headers).json() if topic["id"] == topic_id)
    assert reloaded["progress"]["video_position_seconds"] == 42
    report = client.get("/api/training/admin/progress").json()
    assert next(row for row in report if row["name"] == "Анна Сергеевна")["topics"][-1]["passed"]

    body["questions"][0]["answer"] = [1]
    updated = client.put(f"/api/training/admin/topics/{topic_id}", json=body)
    assert updated.status_code == 200, updated.text
    changed = next(topic for topic in client.get("/api/training/topics", headers=headers).json() if topic["id"] == topic_id)
    assert changed["progress"]["best_score"] is None
    assert not changed["progress"]["passed"]
    assert client.delete(f"/api/training/admin/topics/{topic_id}").status_code == 204
    assert all(topic["id"] != topic_id for topic in client.get("/api/training/topics", headers=headers).json())


def test_unpublished_topic_is_hidden_and_invalid_answers_are_rejected(client):
    headers = _teacher(client)
    draft = next(topic for topic in client.get("/api/training/admin/topics").json() if not topic["published"])
    assert client.patch(f"/api/training/topics/{draft['id']}/progress", json={"material_read": True}, headers=headers).status_code == 404
    assert client.post("/api/training/admin/topics", json={"title": "Пустая", "published": True}).status_code == 422
    assert client.post("/api/training/admin/topics", json={"title": "Ошибка", "questions": [{"prompt": "Тест", "kind": "single", "options": ["А", "Б"], "answer": [0, 1]}]}).status_code == 422
