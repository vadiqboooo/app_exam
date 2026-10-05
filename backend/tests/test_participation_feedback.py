from app.schemas.participation import ParticipationRead
from tests.test_teacher_outside_students import make_exam, result, setup


def enter(client, student, exam, headers=None):
    saved = client.post(
        "/api/participations/quick-result", json=result(student, exam), headers=headers
    )
    assert saved.status_code == 200, saved.text
    return saved.json()["id"]


def put_feedback(client, body, headers=None):
    return client.put("/api/participations/feedback", json=body, headers=headers)


def test_note_and_delivery_status_are_saved_for_all_works_of_a_student(client, engine):
    _, students, physics, _ = setup(client, engine)
    maths = make_exam(engine, "Математика")
    ivanov = students["Иванов Иван"]
    first, second = enter(client, ivanov, physics), enter(client, ivanov, maths)

    saved = put_feedback(
        client,
        {
            "participation_ids": [first, second],
            "feedback": "  Рост в геометрии.  ",
            "parent_status": "sent",
        },
    )
    assert saved.status_code == 200, saved.text
    assert [(p["feedback"], p["parent_status"]) for p in saved.json()] == [
        ("Рост в геометрии.", "sent")
    ] * 2
    listed = {p["id"]: p for p in client.get("/api/participations").json()}
    assert listed[first]["feedback"] == "Рост в геометрии."
    assert listed[second]["parent_status"] == "sent"


def test_status_and_note_change_independently_and_the_note_can_be_cleared(client, engine):
    _, students, physics, _ = setup(client, engine)
    item = enter(client, students["Иванов Иван"], physics)
    put_feedback(
        client, {"participation_ids": [item], "feedback": "Текст", "parent_status": "sent"}
    )

    only_status = put_feedback(client, {"participation_ids": [item], "parent_status": "got"})
    assert (only_status.json()[0]["feedback"], only_status.json()[0]["parent_status"]) == (
        "Текст",
        "got",
    )

    cleared = put_feedback(client, {"participation_ids": [item], "feedback": ""}).json()[0]
    assert (cleared["feedback"], cleared["parent_status"]) == (None, "got")


def test_note_validation(client, engine):
    _, students, physics, chemistry = setup(client, engine)
    ivanov = enter(client, students["Иванов Иван"], physics)
    petrov = enter(client, students["Петров Пётр"], chemistry)

    assert (
        put_feedback(client, {"participation_ids": [ivanov, petrov], "feedback": "x"}).status_code
        == 422
    )
    assert (
        put_feedback(client, {"participation_ids": [ivanov, 9999], "feedback": "x"}).status_code
        == 404
    )
    assert put_feedback(client, {"participation_ids": [], "feedback": "x"}).status_code == 422
    assert (
        put_feedback(client, {"participation_ids": [ivanov], "parent_status": "later"}).status_code
        == 422
    )


def test_teacher_writes_notes_only_for_own_pupils_and_students_never_see_them(client, engine):
    headers, students, physics, chemistry = setup(client, engine)
    own = enter(client, students["Иванов Иван"], physics)
    other = enter(client, students["Петров Пётр"], chemistry)

    allowed = put_feedback(client, {"participation_ids": [own], "feedback": "Молодец"}, headers)
    assert allowed.status_code == 200, allowed.text
    denied = put_feedback(client, {"participation_ids": [other], "feedback": "Чужой"}, headers)
    assert denied.status_code == 404
    # The student-facing schema has no such fields at all.
    assert "feedback" not in ParticipationRead.model_fields
    assert "parent_status" not in ParticipationRead.model_fields
