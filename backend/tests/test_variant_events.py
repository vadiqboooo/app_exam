from app.database import transaction
from app.models import Exam, ExamEvent
from app.time import utcnow
from tests.test_subject_responsible import (
    PDF,
    assign,
    import_teachers,
    teacher_headers,
)


def make_event(engine, title, *subjects):
    with transaction(engine, write=True) as session:
        event = ExamEvent(title=title)
        session.add(event)
        session.flush()
        for subject in subjects:
            session.add(
                Exam(
                    event_id=event.id,
                    type="mock",
                    format="ege",
                    subject=subject,
                    title=title,
                    starts_at=utcnow(),
                    is_active=True,
                )
            )
        return event.id


def setup(client):
    import_teachers(client)
    teachers = {t["name"]: t["id"] for t in client.get("/api/teachers").json()}
    subjects = {(s["name"], s["format"]): s for s in client.get("/api/subjects").json()}
    informatics = subjects[("Информатика", "ege")]
    assert assign(client, informatics, teachers["Анна Сергеевна"]).status_code == 200
    return informatics, teacher_headers(client, "Анна", "Сергеевна")


def upload(client, subject, event_ids, headers=None):
    return client.post(
        f"/api/subjects/{subject['id']}/variants",
        files=[("files", ("v1.pdf", PDF, "application/pdf"))],
        data={"event_ids": [str(event_id) for event_id in event_ids]},
        headers=headers,
    )


def test_variant_is_uploaded_to_several_events_at_once(client, engine):
    informatics, anna = setup(client)
    autumn = make_event(engine, "Осень", "Информатика")
    winter = make_event(engine, "Зима", "Информатика")

    created = upload(client, informatics, [autumn, winter], anna)
    assert created.status_code == 201, created.text
    assert created.json()[0]["event_ids"] == sorted([autumn, winter])
    listed = client.get(f"/api/subjects/{informatics['id']}/variants").json()
    assert listed[0]["event_ids"] == sorted([autumn, winter])


def test_variant_without_events_stays_in_the_library(client, engine):
    informatics, anna = setup(client)
    created = upload(client, informatics, [], anna)
    assert created.status_code == 201
    assert created.json()[0]["event_ids"] == []


def test_only_events_with_the_subject_accept_its_variants(client, engine):
    informatics, anna = setup(client)
    other = make_event(engine, "Только физика", "Физика")
    assert upload(client, informatics, [other], anna).status_code == 422
    assert upload(client, informatics, [9999], anna).status_code == 422
    assert client.get(f"/api/subjects/{informatics['id']}/variants").json() == []


def test_events_of_a_variant_can_be_changed_and_cleared(client, engine):
    informatics, anna = setup(client)
    autumn = make_event(engine, "Осень", "Информатика")
    winter = make_event(engine, "Зима", "Информатика")
    variant = upload(client, informatics, [autumn], anna).json()[0]

    moved = client.put(
        f"/api/subjects/variants/{variant['id']}/events",
        json={"event_ids": [winter]},
        headers=anna,
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["event_ids"] == [winter]
    cleared = client.put(
        f"/api/subjects/variants/{variant['id']}/events", json={"event_ids": []}, headers=anna
    )
    assert cleared.json()["event_ids"] == []


def test_only_the_responsible_teacher_changes_the_events(client, engine):
    informatics, anna = setup(client)
    autumn = make_event(engine, "Осень", "Информатика")
    variant = upload(client, informatics, [], anna).json()[0]
    olga = teacher_headers(client, "Ольга", "Игоревна")
    denied = client.put(
        f"/api/subjects/variants/{variant['id']}/events", json={"event_ids": [autumn]}, headers=olga
    )
    assert denied.status_code == 403
    assert upload(client, informatics, [autumn], olga).status_code == 403


def test_deleting_an_event_or_a_variant_cleans_the_links(client, engine):
    informatics, anna = setup(client)
    autumn = make_event(engine, "Осень", "Информатика")
    winter = make_event(engine, "Зима", "Информатика")
    first = upload(client, informatics, [autumn, winter], anna).json()[0]
    second = upload(client, informatics, [winter], anna).json()[0]

    assert client.delete(f"/api/exam-events/{autumn}").status_code == 200
    listed = client.get(f"/api/subjects/{informatics['id']}/variants").json()
    assert {v["id"]: v["event_ids"] for v in listed}[first["id"]] == [winter]

    assert client.delete(f"/api/subjects/variants/{second['id']}", headers=anna).status_code == 200
    assert client.delete(f"/api/exam-events/{winter}").status_code == 200
    assert client.delete(f"/api/subjects/{informatics['id']}").status_code == 200
