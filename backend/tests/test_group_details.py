import pytest

from app.database import transaction
from app.importers.group_details import group_details
from app.models import Staff, StudyGroup


@pytest.mark.parametrize(
    ("source", "name", "subject", "exam_format", "teacher", "schedule"),
    [
        (
            "Русский язык ОГЭ 2гр. ВТ и ЧТ 15:00 Алина",
            "ОГЭ 2гр",
            "Русский язык",
            "oge",
            "Алина",
            "ВТ и ЧТ 15:00",
        ),
        (
            "Биология ЕГЭ ПН, СБ 15:00 Рымарева Екатерина",
            "ЕГЭ",
            "Биология",
            "ege",
            "Рымарева Екатерина",
            "ПН, СБ 15:00",
        ),
        ("Физика 10 СР15:00-18:00 Артем", "10", "Физика", None, "Артем", "СР15:00-18:00"),
        (
            "Биология ЕГЭ ПН-СБ 15:00 Рымарева Екатерина",
            "ЕГЭ",
            "Биология",
            "ege",
            "Рымарева Екатерина",
            "ПН-СБ 15:00",
        ),
        (
            "Математика 8 класс СБ 10:00. Белоусова Алина",
            "8 класс",
            "Математика",
            None,
            "Белоусова Алина",
            "СБ 10:00",
        ),
        (
            "Русский Язык ОГЭ ПН и ПТ 15:00 Алина А.",
            "ОГЭ",
            "Русский язык",
            "oge",
            "Алина А.",
            "ПН и ПТ 15:00",
        ),
        ("Швецов ЧТ 15:00", "Швецов", None, None, "Швецов", "ЧТ 15:00"),
        (
            "Математика Татаринова СБ 14:00",
            "Татаринова",
            "Математика",
            None,
            "Татаринова",
            "СБ 14:00",
        ),
        ("Семидельская Малышева", "Семидельская Малышева", None, None, None, None),
        ("Русский Язык 10 кл НОВ ГРУП", "10 кл НОВ ГРУП", "Русский язык", None, None, None),
        ("Информатика ЕГЭ — 11 класс", "ЕГЭ — 11 класс", "Информатика", "ege", None, None),
    ],
)
def test_group_display_details(source, name, subject, exam_format, teacher, schedule):
    assert group_details(source) == {
        "display_name": name,
        "subject": subject,
        "exam_format": exam_format,
        "teacher_name": teacher,
        "schedule": schedule,
    }


def test_group_api_prefers_assigned_teacher_and_subject(client):
    with transaction(client.app.state.engine, write=True) as session:
        teacher = Staff(
            name="Анна Иванова", login="teacher-test", password_hash="unused", role="teacher"
        )
        session.add(teacher)
        session.flush()
        session.add(
            StudyGroup(
                source_name="Физика 10 СР15:00-18:00 Артем",
                teacher_id=teacher.id,
                subject="Астрономия",
            )
        )
    response = client.get("/api/groups")
    assert response.status_code == 200
    group = response.json()[0]
    assert group["subject"] == "Астрономия"
    assert group["exam_format"] is None
    assert group["teacher_name"] == "Анна Иванова"
    assert group["display_name"] == "10"
    assert group["source_name"] == "Физика 10 СР15:00-18:00 Артем"
