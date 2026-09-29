from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import pytest
from sqlalchemy import func, select

from app.database import transaction
from app.importers.excel import parse_groups
from app.importers.record import StudentRecord
from app.models import Membership, Student, StudyGroup
from app.services.sync import sync_students

TODAY = date(2026, 9, 18)


def apply(engine, rows, today=TODAY, **kwargs):
    with transaction(engine, write=True) as session:
        preview = sync_students(session, rows, today=today, **kwargs)
    with transaction(engine, write=True) as session:
        return sync_students(
            session, rows, today=today, confirmation=preview["confirmation"], **kwargs
        )


def test_preview_idempotency_departure_return_and_group_history(engine):
    rows = [StudentRecord(full_name="  ИВАНОВ   Алексей ", grade=10, groups=("Математика",))]
    with transaction(engine, write=True) as session:
        preview = sync_students(session, rows, today=TODAY)
        assert preview["report"]["new"] == 1
    with transaction(engine) as session:
        assert session.scalar(select(func.count()).select_from(Student)) == 0
        assert session.scalar(select(func.count()).select_from(StudyGroup)) == 0
    apply(engine, rows)
    assert apply(engine, rows)["report"]["unchanged"] == 1
    changed = [rows[0].model_copy(update={"groups": ("Физика",)})]
    report = apply(engine, changed)["report"]
    assert report["changed_groups"] == report["memberships_added"] == 1
    assert report["memberships_closed"] == 1
    report = apply(engine, [], allow_empty=True)["report"]
    assert report["left"] == 1
    assert apply(engine, rows, TODAY + timedelta(days=1))["report"]["returned"] == 1
    with transaction(engine) as session:
        student = session.scalar(select(Student))
        assert student.id == 1 and student.name_key == "иванов алексей"
        history = list(session.scalars(select(Membership).order_by(Membership.id)))
        assert len(history) == 3
        assert history[0].ended_at == TODAY and history[1].ended_at == TODAY
        assert history[2].ended_at is None
        assert history[2].group_id == history[0].group_id


def test_stale_preview_and_empty_import_rejected(engine):
    rows = [StudentRecord(full_name="Иванов Алексей")]
    with transaction(engine, write=True) as session:
        preview = sync_students(session, rows, today=TODAY)
    apply(engine, [StudentRecord(full_name="Петров Иван")])
    with pytest.raises(ValueError, match="изменились"):
        with transaction(engine, write=True) as session:
            sync_students(session, rows, today=TODAY, confirmation=preview["confirmation"])
    with pytest.raises(ValueError, match="Пустая"):
        apply(engine, [])


def test_reimport_replaces_old_combined_group_and_preserves_history(engine):
    combined = "Физика ПН 15:00,Биология ЕГЭ ПН, СБ 15:00 Рымарева Екатерина"
    old = StudentRecord(full_name="Иванов Иван", groups=(combined,))
    apply(engine, [old])
    corrected = old.model_copy(update={"groups": parse_groups(combined)})
    report = apply(engine, [corrected])["report"]
    assert report["changed_groups"] == 1
    assert report["memberships_closed"] == 1
    assert report["memberships_added"] == 2
    with transaction(engine) as session:
        assert session.scalar(select(func.count()).select_from(Student)) == 1
        history = list(session.scalars(select(Membership).order_by(Membership.id)))
        assert len(history) == 3
        assert history[0].ended_at == TODAY
        assert all(m.ended_at is None for m in history[1:])
        old_group = session.get(StudyGroup, history[0].group_id)
        assert old_group.source_name == combined and not old_group.is_active


def test_external_id_adoption_and_renaming(engine):
    apply(engine, [StudentRecord(full_name="Иванова Анна")])
    apply(engine, [StudentRecord(full_name="Иванова Анна", external_id="crm-1")])
    apply(engine, [StudentRecord(full_name="Петрова Анна", external_id="crm-1")])
    with transaction(engine) as session:
        students = list(session.scalars(select(Student)))
        assert len(students) == 1
        assert students[0].full_name == "Петрова Анна"
        assert students[0].external_id == "crm-1"


@pytest.mark.parametrize(
    "rows",
    [
        [StudentRecord(full_name="Иванов Иван"), StudentRecord(full_name="ИВАНОВ Иван")],
        [
            StudentRecord(full_name="Иванов Иван", external_id="1"),
            StudentRecord(full_name="Петров Иван", external_id="1"),
        ],
        [
            StudentRecord(full_name="Иванов Иван"),
            StudentRecord(full_name="Иванов Иван", external_id="1"),
        ],
    ],
)
def test_duplicate_import_does_not_write(engine, rows):
    with pytest.raises(ValueError):
        apply(engine, rows)
    with transaction(engine) as session:
        assert session.scalar(select(func.count()).select_from(Student)) == 0


def test_ambiguous_names_require_id(engine):
    apply(
        engine,
        [
            StudentRecord(full_name="Иванов Иван", external_id="1"),
            StudentRecord(full_name="Иванов Иван", external_id="2"),
        ],
    )
    with pytest.raises(ValueError, match="Неоднозначное"):
        apply(engine, [StudentRecord(full_name="Иванов Иван")])


def test_inactive_record_closes_membership_and_atomic_rollback(engine):
    rows = [StudentRecord(full_name="Иванов Иван", groups=("Физика",))]
    apply(engine, rows)
    inactive = [rows[0].model_copy(update={"is_active": False})]
    with pytest.raises(RuntimeError):
        with transaction(engine, write=True) as session:
            preview = sync_students(session, inactive, today=TODAY)
            sync_students(session, inactive, today=TODAY, confirmation=preview["confirmation"])
            raise RuntimeError("Simulated failure before commit")
    with transaction(engine) as session:
        assert session.get(Student, 1).is_active
        assert session.get(Membership, 1).ended_at is None
    assert apply(engine, inactive)["report"]["left"] == 1


def test_concurrent_confirmations_only_apply_once(engine):
    rows = [StudentRecord(full_name="Иванов Иван", groups=("Физика",))]
    with transaction(engine, write=True) as session:
        token = sync_students(session, rows, today=TODAY)["confirmation"]

    def confirm():
        try:
            with transaction(engine, write=True) as session:
                sync_students(session, rows, today=TODAY, confirmation=token)
            return "applied"
        except ValueError:
            return "stale"

    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(lambda _: confirm(), range(2)))
    assert sorted(outcomes) == ["applied", "stale"]
    with transaction(engine) as session:
        assert session.scalar(select(func.count()).select_from(Student)) == 1
        assert session.scalar(select(func.count()).select_from(Membership)) == 1


def test_confirmation_rejects_changed_file(engine):
    rows = [StudentRecord(full_name="Иванов Иван")]
    with transaction(engine, write=True) as session:
        token = sync_students(session, rows, today=TODAY)["confirmation"]
    with pytest.raises(ValueError, match="изменились"):
        with transaction(engine, write=True) as session:
            sync_students(
                session, [StudentRecord(full_name="Петров Иван")], today=TODAY, confirmation=token
            )
