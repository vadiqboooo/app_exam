from sqlalchemy import select

from app.database import transaction
from app.models import ProgramTopic, Staff, Subject
from app.services.student_session import issue_token
from app.time import utcnow


def _staff(engine, name, *, responsible=False):
    with transaction(engine, write=True) as session:
        staff = Staff(
            name=name,
            login=name,
            password_hash="unused",
            role="teacher",
            is_teacher=True,
            is_responsible=responsible,
        )
        session.add(staff)
        session.flush()
        return staff.id


def _headers(staff_id):
    return {"Authorization": f"Bearer {issue_token(staff_id, 'test-key', 'teacher')}"}


def test_program_approval_visibility_and_responsible_permissions(client, engine):
    owner_id = _staff(engine, "Ответственный", responsible=True)
    teacher_id = _staff(engine, "Учитель")
    with transaction(engine, write=True) as session:
        subject = session.scalar(
            select(Subject).where(Subject.name == "Информатика", Subject.format == "ege")
        )
        subject.responsible_id = owner_id
        subject_id = subject.id

    url = f"/api/subjects/{subject_id}/program"
    draft = {
        "sections": [
            {"title": "Алгоритмы", "topics": [{"title": "Поиск"}, {"title": "Сортировка"}]}
        ]
    }
    denied = client.put(url, json=draft, headers=_headers(teacher_id))
    assert denied.status_code == 403

    created = client.put(url, json=draft, headers=_headers(owner_id))
    assert created.status_code == 200, created.text
    owner_view = created.json()
    assert owner_view["can_edit"] is True
    assert [topic["status"] for topic in owner_view["sections"][0]["topics"]] == ["draft", "draft"]
    assert owner_view["sections"][0]["topics"][0]["author_name"] == "Ответственный"
    assert client.get(url, headers=_headers(teacher_id)).json() == {
        "subject_id": subject_id,
        "can_edit": False,
        "can_review": False,
        "sections": [],
    }

    first_topic = owner_view["sections"][0]["topics"][0]
    with transaction(engine, write=True) as session:
        stored = session.get(ProgramTopic, first_topic["id"])
        stored.status = "approved"
        stored.approved_at = utcnow()

    public = client.get(url, headers=_headers(teacher_id)).json()
    assert [topic["title"] for topic in public["sections"][0]["topics"]] == ["Поиск"]
    assert (
        client.get(url, headers=_headers(owner_id)).json()["sections"][0]["topics"][1]["title"]
        == "Сортировка"
    )

    section = owner_view["sections"][0]
    changed = {
        "sections": [
            {
                "id": section["id"],
                "title": "Алгоритмы",
                "topics": [
                    {"id": first_topic["id"], "title": "Бинарный поиск"},
                    {"id": section["topics"][1]["id"], "title": "Сортировка"},
                ],
            }
        ]
    }
    updated = client.put(url, json=changed, headers=_headers(owner_id))
    assert updated.status_code == 200, updated.text
    assert updated.json()["sections"][0]["topics"][0]["status"] == "draft"
    assert client.get(url, headers=_headers(teacher_id)).json()["sections"] == []


def test_topic_status_permissions_and_author(client, engine):
    owner_id = _staff(engine, "Автор темы", responsible=True)
    other_id = _staff(engine, "Другой учитель")
    with transaction(engine, write=True) as session:
        subject = session.scalar(
            select(Subject).where(Subject.name == "Информатика", Subject.format == "ege")
        )
        subject.responsible_id = owner_id
        subject_id = subject.id

    url = f"/api/subjects/{subject_id}/program"
    created = client.put(
        url,
        json={"sections": [{"title": "Раздел", "topics": [{"title": "Графы"}]}]},
        headers=_headers(owner_id),
    )
    assert created.status_code == 200, created.text
    topic = created.json()["sections"][0]["topics"][0]
    assert topic["author_name"] == "Автор темы"
    assert created.json()["can_review"] is False
    status_url = f"{url}/topics/{topic['id']}/status"

    assert client.patch(status_url, json={"status": "review"}, headers=_headers(other_id)).status_code == 403
    assert client.patch(status_url, json={"status": "approved"}, headers=_headers(owner_id)).status_code == 403
    submitted = client.patch(status_url, json={"status": "review"}, headers=_headers(owner_id))
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["sections"][0]["topics"][0]["status"] == "review"
    assert client.get(url, headers=_headers(other_id)).json()["sections"] == []

    returned = client.patch(status_url, json={"status": "changes"})
    assert returned.status_code == 200, returned.text
    assert returned.json()["can_review"] is True
    assert returned.json()["sections"][0]["topics"][0]["status"] == "changes"
    assert client.patch(status_url, json={"status": "review"}, headers=_headers(owner_id)).status_code == 200
    approved = client.patch(status_url, json={"status": "approved"})
    assert approved.status_code == 200, approved.text
    assert approved.json()["sections"][0]["topics"][0]["approved_at"] is not None
    public_topic = client.get(url, headers=_headers(other_id)).json()["sections"][0]["topics"][0]
    assert public_topic["author_name"] == "Автор темы"
    assert public_topic["status"] == "approved"


def test_topic_materials_respect_owner_and_approval(client, engine, monkeypatch):
    monkeypatch.setattr("app.api.programs.scan_upload", lambda data, host, port: None)
    owner_id = _staff(engine, "Ответственный за материалы", responsible=True)
    teacher_id = _staff(engine, "Просматривающий материалы")
    with transaction(engine, write=True) as session:
        subject = session.scalar(
            select(Subject).where(Subject.name == "Информатика", Subject.format == "ege")
        )
        subject.responsible_id = owner_id
        subject_id = subject.id
    program_url = f"/api/subjects/{subject_id}/program"
    created = client.put(
        program_url,
        json={"sections": [{"title": "Раздел", "topics": [{"title": "Тема"}]}]},
        headers=_headers(owner_id),
    ).json()
    topic_id = created["sections"][0]["topics"][0]["id"]
    url = f"{program_url}/topics/{topic_id}/materials"
    file = {"file": ("lesson.pdf", b"%PDF-1.4 test", "application/pdf")}
    assert client.post(url, files=file, headers=_headers(teacher_id)).status_code == 403
    assert client.get(url, headers=_headers(teacher_id)).status_code == 404
    uploaded = client.post(url, files=file, headers=_headers(owner_id))
    assert uploaded.status_code == 201, uploaded.text
    assert uploaded.json()["scanned_at"] is not None
    material_id = uploaded.json()["id"]
    download_url = f"{url}/{material_id}/download"
    assert client.get(download_url, headers=_headers(owner_id)).content == b"%PDF-1.4 test"
    with transaction(engine, write=True) as session:
        topic = session.get(ProgramTopic, topic_id)
        topic.status = "approved"
        topic.approved_at = utcnow()
    teacher_material = client.get(url, headers=_headers(teacher_id)).json()[0]
    assert teacher_material["filename"] == "lesson.pdf"
    assert teacher_material["scanned_at"] == uploaded.json()["scanned_at"]
    assert client.get(download_url, headers=_headers(teacher_id)).content == b"%PDF-1.4 test"
    assert client.delete(f"{url}/{material_id}", headers=_headers(teacher_id)).status_code == 403
    assert client.delete(f"{url}/{material_id}", headers=_headers(owner_id)).status_code == 204
    assert client.get(url, headers=_headers(teacher_id)).status_code == 404


def test_program_rejects_foreign_ids(client, engine):
    owner_id = _staff(engine, "Ответственный", responsible=True)
    subjects = client.get("/api/subjects").json()
    first, second = subjects[0], subjects[1]
    with transaction(engine, write=True) as session:
        session.get(Subject, first["id"]).responsible_id = owner_id
        session.get(Subject, second["id"]).responsible_id = owner_id
    first_url = f"/api/subjects/{first['id']}/program"
    second_url = f"/api/subjects/{second['id']}/program"
    section = client.put(
        first_url,
        json={"sections": [{"title": "Первый", "topics": [{"title": "Тема"}]}]},
        headers=_headers(owner_id),
    ).json()["sections"][0]
    response = client.put(
        second_url,
        json={"sections": [{"id": section["id"], "title": "Чужой"}]},
        headers=_headers(owner_id),
    )
    assert response.status_code == 422
    assert client.get(second_url, headers=_headers(owner_id)).json()["sections"] == []
