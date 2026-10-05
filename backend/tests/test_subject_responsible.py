from io import BytesIO

from openpyxl import Workbook

PDF = b"%PDF-1.4\n% variant\n"
DOCX = b"PK\x03\x04docx-body"
DOC = b"\xd0\xcf\x11\xe0doc-body"


def import_teachers(client):
    book = Workbook()
    book.active.append(["ФИО", "Статус обучения", "Активные группы", "Класс обучения"])
    book.active.append(["Иванов Иван", "Обучается", "Физика ПН 15:00 Анна Сергеевна", 10])
    book.active.append(["Петров Пётр", "Обучается", "Химия ВТ 16:00 Ольга Игоревна", 11])
    output = BytesIO()
    book.save(output)
    files = {"file": ("crm.xlsx", output.getvalue())}
    preview = client.post("/api/imports/preview", files=files)
    applied = client.post(
        "/api/imports/apply", files=files, data={"confirmation": preview.json()["confirmation"]}
    )
    assert applied.status_code == 200, applied.text


def teacher_headers(client, first_name, middle_name):
    response = client.post(
        "/api/teacher/login",
        json={"first_name": first_name, "middle_name": middle_name, "code": "123456"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def setup(client):
    import_teachers(client)
    teachers = {t["name"]: t["id"] for t in client.get("/api/teachers").json()}
    subjects = {(s["name"], s["format"]): s for s in client.get("/api/subjects").json()}
    return (
        teachers,
        subjects[("Информатика", "ege")],
        subjects[("Биология", "ege")],
        teacher_headers(client, "Анна", "Сергеевна"),
        teacher_headers(client, "Ольга", "Игоревна"),
    )


def assign(client, subject, teacher_id):
    body = {
        "name": subject["name"],
        "format": subject["format"],
        "tasks": subject["tasks"],
        "primary_to_secondary_scale": subject["primary_to_secondary_scale"],
        "grade_scale": subject["grade_scale"],
        "is_active": subject["is_active"],
        "responsible_id": teacher_id,
    }
    return client.put(f"/api/subjects/{subject['id']}", json=body)


def test_admin_assigns_a_responsible_teacher_who_sees_the_subject(client):
    teachers, informatics, biology, anna, olga = setup(client)
    done = assign(client, informatics, teachers["Анна Сергеевна"])
    assert done.status_code == 200, done.text
    assert done.json()["responsible_name"] == "Анна Сергеевна"
    assert done.json()["responsible_since"] is not None

    mine = client.get("/api/subjects/mine", headers=anna).json()
    assert [s["name"] for s in mine] == ["Информатика"]
    assert client.get("/api/subjects/mine", headers=olga).json() == []
    assert client.get("/api/subjects/mine").json() == []

    # Switching the subject off from the list must not drop the teacher.
    toggled = client.put(
        f"/api/subjects/{informatics['id']}",
        json={
            "name": "Информатика",
            "format": "ege",
            "tasks": informatics["tasks"],
            "primary_to_secondary_scale": informatics["primary_to_secondary_scale"],
            "grade_scale": informatics["grade_scale"],
            "is_active": False,
        },
    )
    assert toggled.json()["responsible_name"] == "Анна Сергеевна"
    assert toggled.json()["is_active"] is False


def test_only_a_teacher_can_be_responsible_and_can_be_cleared(client):
    teachers, informatics, _, _, _ = setup(client)
    assert assign(client, informatics, 99999).status_code == 422
    assign(client, informatics, teachers["Анна Сергеевна"])
    cleared = assign(client, informatics, None)
    assert cleared.json()["responsible_id"] is None
    assert cleared.json()["responsible_since"] is None


def test_teacher_edits_tasks_and_scale_of_their_own_subject_only(client):
    teachers, informatics, biology, anna, _ = setup(client)
    assign(client, informatics, teachers["Анна Сергеевна"])
    content = {
        "tasks": [{"code": "1", "title": "Задание 1", "max_score": 2}],
        "primary_to_secondary_scale": [0, 40, 80],
        "grade_scale": None,
    }
    own = client.put(f"/api/subjects/{informatics['id']}/content", json=content, headers=anna)
    assert own.status_code == 200, own.text
    assert own.json()["max_primary_score"] == 2
    assert own.json()["primary_to_secondary_scale"] == [0, 40, 80]
    assert own.json()["name"] == "Информатика"

    other = client.put(f"/api/subjects/{biology['id']}/content", json=content, headers=anna)
    assert other.status_code == 403
    assert client.put(f"/api/subjects/{biology['id']}/content", json=content).status_code == 200
    assert (
        client.put(f"/api/subjects/{informatics['id']}", json={}, headers=anna).status_code == 403
    )


def upload(client, subject_id, files, headers=None):
    return client.post(
        f"/api/subjects/{subject_id}/variants",
        files=[("files", (name, data, "application/octet-stream")) for name, data in files],
        headers=headers,
    )


def test_responsible_teacher_manages_printable_variants(client):
    teachers, informatics, _, anna, olga = setup(client)
    assign(client, informatics, teachers["Анна Сергеевна"])
    sid = informatics["id"]

    created = upload(client, sid, [("variant_1.pdf", PDF), ("Вариант 2.docx", DOCX)], anna)
    assert created.status_code == 201, created.text
    first, second = created.json()
    assert [first["name"], second["name"]] == ["variant_1", "Вариант 2"]
    assert first["size"] == len(PDF)
    assert upload(client, sid, [("old.doc", DOC)], anna).status_code == 201

    assert len(client.get(f"/api/subjects/{sid}/variants", headers=olga).json()) == 3
    count = next(s for s in client.get("/api/subjects", headers=olga).json() if s["id"] == sid)
    assert count["variants_count"] == 3

    download = client.get(f"/api/subjects/variants/{first['id']}/download", headers=olga)
    assert download.status_code == 200
    assert download.content == PDF
    assert download.headers["content-type"] == "application/pdf"
    assert "variant_1.pdf" in download.headers["content-disposition"]

    renamed = client.patch(
        f"/api/subjects/variants/{first['id']}", json={"name": "Вариант 1"}, headers=anna
    )
    assert renamed.json()["name"] == "Вариант 1"
    replaced = client.put(
        f"/api/subjects/variants/{first['id']}/file",
        files={"file": ("new.docx", DOCX, "application/octet-stream")},
        headers=anna,
    )
    assert replaced.json()["filename"] == "new.docx"
    assert client.get(f"/api/subjects/variants/{first['id']}/download").content == DOCX

    assert client.delete(f"/api/subjects/variants/{second['id']}", headers=anna).status_code == 200
    assert len(client.get(f"/api/subjects/{sid}/variants").json()) == 2


def test_variants_accept_only_real_pdf_and_word_files_and_only_from_the_responsible(client):
    teachers, informatics, biology, anna, olga = setup(client)
    assign(client, informatics, teachers["Анна Сергеевна"])
    sid = informatics["id"]

    assert upload(client, sid, [("notes.txt", b"hello")], anna).status_code == 422
    assert upload(client, sid, [("fake.pdf", b"not a pdf")], anna).status_code == 422
    assert upload(client, sid, [("empty.pdf", b"")], anna).status_code == 422
    huge = PDF + b"0" * (20 * 1024 * 1024)
    assert upload(client, sid, [("huge.pdf", huge)], anna).status_code == 422
    assert client.get(f"/api/subjects/{sid}/variants").json() == []

    assert upload(client, sid, [("variant.pdf", PDF)], olga).status_code == 403
    assert upload(client, biology["id"], [("variant.pdf", PDF)], anna).status_code == 403
    assert upload(client, sid, [("variant.pdf", PDF)]).status_code == 201


def test_deleting_the_teacher_or_the_subject_cleans_up(client):
    teachers, informatics, biology, anna, _ = setup(client)
    assign(client, informatics, teachers["Анна Сергеевна"])
    assign(client, biology, teachers["Анна Сергеевна"])
    upload(client, biology["id"], [("variant.pdf", PDF)])

    assert client.delete(f"/api/teachers/{teachers['Анна Сергеевна']}").status_code == 200
    subjects = {s["id"]: s for s in client.get("/api/subjects").json()}
    assert subjects[informatics["id"]]["responsible_id"] is None

    assert client.delete(f"/api/subjects/{biology['id']}").json() == {"ok": True}
    assert client.get(f"/api/subjects/{biology['id']}/variants").status_code == 404
