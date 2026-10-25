from tests.test_teacher_portal import import_rows, teacher_headers


def _teacher(client):
    import_rows(client, [["Иванов Иван", "Обучается", "Физика ПН 15:00 Анна Сергеевна", 10]])
    return teacher_headers(client, "Анна", "Сергеевна")


def _anna(client):
    return next(item for item in client.get("/api/teachers").json() if item["name"] == "Анна Сергеевна")


def test_teacher_finishes_both_parts_and_admin_sees_it(client):
    headers = _teacher(client)
    assert client.get("/api/training", headers=headers).json() == {"groups_at": None, "outside_at": None}
    assert _anna(client)["training_groups_at"] is None

    first = client.post("/api/training/groups", headers=headers)
    assert first.status_code == 200, first.text
    assert first.json()["groups_at"] is not None and first.json()["outside_at"] is None
    row = _anna(client)
    assert row["training_groups_at"] is not None and row["training_outside_at"] is None

    # Passing a part again keeps the first date.
    again = client.post("/api/training/groups", headers=headers)
    assert again.json()["groups_at"] == first.json()["groups_at"]

    done = client.post("/api/training/outside", headers=headers)
    assert done.json()["outside_at"] is not None
    assert client.get("/api/training", headers=headers).json() == done.json()
    row = _anna(client)
    assert row["training_groups_at"] and row["training_outside_at"]


def test_unknown_part_and_missing_employee(client):
    headers = _teacher(client)
    assert client.post("/api/training/everything", headers=headers).status_code == 422
    # The API key is not an employee, so there is nobody to record the progress for.
    assert client.post("/api/training/groups").status_code == 404
    assert client.get("/api/training").json() == {"groups_at": None, "outside_at": None}
