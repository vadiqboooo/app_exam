import sqlite3
from io import BytesIO

from openpyxl import Workbook
from sqlalchemy import select

from app.database import transaction
from app.models import Participation, Subject

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def workbook(rows) -> bytes:
    book = Workbook()
    sheet = book.active
    for row in rows:
        sheet.append(row)
    buffer = BytesIO()
    book.save(buffer)
    return buffer.getvalue()


TEACHERS = workbook(
    [
        ("ФИО", "Предметы"),
        ("Екатерина Сергеевна", "Математика"),
        ("Олег Викторович", "Русский язык, Литература"),
    ]
)
GROUPS = workbook(
    [
        ("Название группы", "Предмет", "Тип", "Учитель", "Расписание"),
        ("ЕГЭ Мат. профиль · 11А", "Математика", "ЕГЭ", "Екатерина С.", "Пн, Чт 17:00"),
        ("ОГЭ Русский · 9Б", "Русский язык", "ОГЭ", "Олег Викторович", "Вт 16:00"),
        ("ЕГЭ Информатика · 10А", "Информатика", "ЕГЭ", "Пётр Ильич", None),
    ]
)
STUDENTS = workbook(
    [
        ("ФИО", "Статус обучения", "Активные группы", "Класс обучения", "ID"),
        ("Иванов Алексей", "Обучается", "ЕГЭ Мат. профиль · 11А", 11, "1"),
        ("Петрова Мария", "Обучается", "ОГЭ Русский · 9Б", 9, "2"),
        ("Тихонов Егор", "Обучается", "ОГЭ Физика · 9А", 9, "3"),
    ]
)


def files(**named):
    return {name: (f"{name}.xlsx", data, XLSX) for name, data in named.items()}


def test_step_previews_match_names_by_initials(client):
    teachers = client.post("/api/imports/teachers/preview", files=files(file=TEACHERS))
    assert teachers.status_code == 200, teachers.text
    assert teachers.json()["new"] == 2
    assert teachers.json()["rows"][0]["subjects"]

    groups = client.post(
        "/api/imports/groups/preview", files=files(file=GROUPS, teachers=TEACHERS)
    ).json()
    assert groups["total"] == 3
    assert groups["with_teacher"] == 2 and groups["without_teacher"] == 1
    assert [row["status"] for row in groups["rows"]].count("no_teacher") == 1

    students = client.post(
        "/api/imports/students/preview", files=files(file=STUDENTS, groups=GROUPS)
    ).json()
    assert students["new"] == 2 and students["unknown_group"] == 1


def test_run_applies_every_file_in_one_confirmed_transaction(client):
    upload = files(teachers=TEACHERS, groups=GROUPS, students=STUDENTS)
    preview = client.post("/api/imports/run/preview", files=upload)
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert body["applied"] is False
    assert body["report"]["teachers"] == {"total": 2, "new": 2}
    assert body["report"]["groups"]["without_teacher"] == 1
    assert body["report"]["students"]["unknown_groups"] == 1
    assert len(body["warnings"]) == 2
    assert client.get("/api/students").json() == []

    wrong = client.post("/api/imports/run/apply", files=upload, data={"confirmation": "0" * 64})
    assert wrong.status_code == 422

    applied = client.post(
        "/api/imports/run/apply", files=upload, data={"confirmation": body["confirmation"]}
    )
    assert applied.status_code == 200, applied.text
    assert applied.json()["applied"] is True
    assert len(client.get("/api/students").json()) == 3
    groups = client.get("/api/groups").json()
    assert {g["source_name"] for g in groups if g["is_active"]} == {
        "ЕГЭ Мат. профиль · 11А",
        "ОГЭ Русский · 9Б",
    }
    # A group without pupils is created but stays hidden until someone joins it.
    assert "ЕГЭ Информатика · 10А" in {g["source_name"] for g in groups}
    teachers = {t["name"] for t in client.get("/api/teachers").json()}
    assert teachers == {"Екатерина Сергеевна", "Олег Викторович"}
    again = client.post("/api/imports/run/preview", files=upload).json()
    assert again["report"]["teachers"]["new"] == 0


def legacy_database(path, tasks: int) -> bytes:
    connection = sqlite3.connect(path)
    connection.executescript(
        """
        CREATE TABLE student (id INTEGER PRIMARY KEY, fio TEXT);
        CREATE TABLE exam (id INTEGER PRIMARY KEY, id_student INTEGER, subject TEXT,
                           answer TEXT, comment TEXT);
        CREATE TABLE probnik (id INTEGER PRIMARY KEY, name TEXT, created_at TEXT);
        INSERT INTO student VALUES (1, 'Иванов Алексей'), (2, 'Неизвестный Ученик');
        INSERT INTO probnik VALUES (1, 'Осенний пробник 25/26', '2025-12-19 14:44:07.681698');
        """
    )
    answer = ",".join(["1"] * (tasks - 2) + ["-", "-"])
    connection.execute("INSERT INTO exam VALUES (1, 1, 'infa', ?, 'Хорошо')", (answer,))
    connection.execute("INSERT INTO exam VALUES (2, 2, 'infa', ?, '')", (answer,))
    connection.execute("INSERT INTO exam VALUES (3, 1, 'unknown_code', '1,1', '')")
    connection.commit()
    connection.close()
    return path.read_bytes()


def test_legacy_results_are_linked_by_full_name_and_never_published(client, engine, tmp_path):
    with transaction(engine) as session:
        tasks = len(
            session.scalars(
                select(Subject).where(Subject.name == "Информатика", Subject.format == "ege")
            )
            .one()
            .tasks
        )
    legacy = legacy_database(tmp_path / "old.db", tasks)

    summary = client.post(
        "/api/imports/legacy/analyze",
        files={"file": ("old.db", legacy, "application/octet-stream")},
    )
    assert summary.status_code == 200, summary.text
    assert summary.json()["works"] == 3 and summary.json()["title"] == "Осенний пробник 25/26"

    upload = {
        **files(students=STUDENTS),
        "legacy": ("old.db", legacy, "application/octet-stream"),
    }
    preview = client.post("/api/imports/run/preview", files=upload).json()
    assert preview["report"]["legacy"] == {
        "works": 3,
        "linked": 1,
        "unlinked": 2,
        "already": 0,
        "students": 1,
    }
    applied = client.post(
        "/api/imports/run/apply", files=upload, data={"confirmation": preview["confirmation"]}
    )
    assert applied.status_code == 200, applied.text

    with transaction(engine) as session:
        works = list(session.scalars(select(Participation)))
    assert len(works) == 1
    assert works[0].status == "checked" and works[0].checked_by == "Прошлая версия"
    assert works[0].primary_score == tasks - 2
    assert works[0].result_data["overall_comment"] == "Хорошо"
    assert works[0].published_at is None


def test_rejects_files_that_are_not_what_the_step_expects(client):
    bad = client.post(
        "/api/imports/legacy/analyze", files={"file": ("x.db", b"not sqlite", "text/plain")}
    )
    assert bad.status_code == 422
    no_name = workbook([("Предметы",), ("Математика",)])
    assert (
        client.post("/api/imports/teachers/preview", files=files(file=no_name)).status_code == 422
    )
    assert client.post("/api/imports/run/preview").status_code == 422
