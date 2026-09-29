import sqlite3
from datetime import date

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.config import ROOT
from app.database import make_engine, transaction
from app.models import Membership, Student
from app.services.backup import backup_database


def test_foreign_keys_and_migrations(engine):
    command.check(Config(str(ROOT / "alembic.ini")))
    with engine.connect() as connection:
        assert connection.scalar(text("PRAGMA foreign_keys")) == 1
        assert connection.scalar(text("PRAGMA journal_mode")) == "wal"
    with pytest.raises(IntegrityError):
        with transaction(engine, write=True) as session:
            session.add(Membership(student_id=999, group_id=999, started_at=date.today()))


def test_live_backup_is_portable_and_never_overwrites(engine, tmp_path):
    with transaction(engine, write=True) as session:
        session.add(Student(full_name="Иванов Иван", name_key="иванов иван"))
    backup = backup_database(engine, tmp_path / "backup.db")
    with sqlite3.connect(backup) as connection:
        assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
    restored = make_engine(f"sqlite:///{backup.as_posix()}")
    try:
        with transaction(restored) as session:
            assert session.scalar(select(Student)).full_name == "Иванов Иван"
    finally:
        restored.dispose()
    with pytest.raises(FileExistsError):
        backup_database(engine, backup)
    with pytest.raises(ValueError):
        backup_database(engine, tmp_path / "probnik.db")


def test_event_migration_preserves_existing_exams_results_and_foreign_keys(tmp_path, monkeypatch):
    path = tmp_path / "legacy.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{path.as_posix()}")
    config = Config(str(ROOT / "alembic.ini"))
    command.upgrade(config, "cf7342210e6c")
    with sqlite3.connect(path) as connection:
        connection.execute(
            "INSERT INTO students (id, full_name, name_key, is_active) "
            "VALUES (1, 'Иванов Иван', 'иванов иван', 1)"
        )
        connection.execute(
            "INSERT INTO exams (id, type, subject, starts_at, is_active) "
            "VALUES (1, 'mock', 'Физика', '2026-01-01', 1)"
        )
        connection.execute(
            "INSERT INTO participations "
            "(student_id, exam_id, status, primary_score, updated_at) "
            "VALUES (1, 1, 'published', 50, '2026-01-02')"
        )
    command.upgrade(config, "head")
    command.check(config)
    with sqlite3.connect(path) as connection:
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
        assert connection.execute("SELECT subject, event_id FROM exams").fetchone() == (
            "Физика",
            None,
        )
        assert connection.execute(
            "SELECT primary_score, slot_id FROM participations"
        ).fetchone() == (50, None)


def test_shared_slot_migration_merges_subject_quotas_and_keeps_bookings(tmp_path, monkeypatch):
    path = tmp_path / "subject-slots.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{path.as_posix()}")
    config = Config(str(ROOT / "alembic.ini"))
    command.upgrade(config, "8b2e91a4c703")
    with sqlite3.connect(path) as connection:
        connection.execute("INSERT INTO exam_events (id, title) VALUES (1, 'Осенний пробник')")
        connection.execute(
            "INSERT INTO exam_schools (id, event_id, name) VALUES (1, 1, 'Школа № 1')"
        )
        connection.executemany(
            "INSERT INTO exams (id, event_id, format, type, subject, starts_at, is_active) "
            "VALUES (?, 1, 'ege', 'mock', ?, '2030-10-26 10:00:00', 1)",
            [(1, "Физика"), (2, "Информатика")],
        )
        connection.executemany(
            "INSERT INTO exam_slots (id, exam_id, school_id, starts_at, capacity) "
            "VALUES (?, ?, 1, '2030-10-26 10:00:00', 1)",
            [(1, 1), (2, 2)],
        )
        connection.executemany(
            "INSERT INTO students (id, full_name, name_key, is_active) VALUES (?, ?, ?, 1)",
            [(1, "Иванов Иван", "иванов иван"), (2, "Петров Пётр", "петров пётр")],
        )
        connection.executemany(
            "INSERT INTO participations "
            "(student_id, exam_id, slot_id, status, updated_at) "
            "VALUES (?, ?, ?, 'registered', '2026-01-01')",
            [(1, 1, 1), (2, 2, 2)],
        )

    command.upgrade(config, "head")
    command.check(config)
    with sqlite3.connect(path) as connection:
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
        assert connection.execute(
            "SELECT id, event_id, school_id, capacity FROM exam_slots"
        ).fetchall() == [(1, 1, 1, 2)]
        assert connection.execute("SELECT slot_id FROM participations ORDER BY id").fetchall() == [
            (1,),
            (1,),
        ]
