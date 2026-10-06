import gzip
import os
import sqlite3
import tempfile
import zlib
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy.engine import Engine

from app.config import ROOT
from app.services.backup import backup_database
from app.services.cloud_backup import BackupStore, is_backup
from app.time import utcnow

SQLITE_MAGIC = b"SQLite format 3\x00"
# Tables that every copy made by this app has, whatever its schema version.
REQUIRED_TABLES = {"alembic_version", "students", "exams", "participations"}


def restore_backup(engine: Engine, store: BackupStore, name: str) -> Path:
    """Replaces the working database with a copy from the cloud; returns the safety copy.

    The data of the working database is first saved next to it, so a mistaken restore can be
    undone. A copy made by an older version of the app is brought up to date by the migrations.
    """
    database = engine.url.database
    if engine.dialect.name != "sqlite" or not database:
        raise ValueError("Восстановление работает только с файловой базой SQLite")
    if not is_backup(name) or name not in {item.name for item in store.list()}:
        raise ValueError("Такой копии нет на диске")
    try:
        data = gzip.decompress(store.download(name))
    except (OSError, EOFError, zlib.error) as error:
        raise ValueError("Не удалось распаковать копию") from error
    if not data.startswith(SQLITE_MAGIC):
        raise ValueError("Файл не похож на базу SQLite")

    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "restore.db"
        path.write_bytes(data)
        source = sqlite3.connect(path)
        try:
            try:
                tables = {
                    row[0]
                    for row in source.execute("SELECT name FROM sqlite_master WHERE type='table'")
                }
                healthy = source.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
            except sqlite3.DatabaseError as error:
                raise ValueError("Копия повреждена") from error
            if not REQUIRED_TABLES <= tables:
                raise ValueError("Это не копия базы приложения")
            if not healthy:
                raise ValueError("Копия повреждена")
            safety = backup_database(
                engine,
                Path(database).parent
                / "before-restore"
                / f"before-restore-{utcnow():%Y%m%d-%H%M%S}.db",
            )
            # SQLite's own backup API writes the pages into the live database, so open
            # connections stay valid and nothing needs to be stopped.
            raw = engine.raw_connection()
            try:
                source.backup(raw.driver_connection)
            finally:
                raw.close()
        finally:
            source.close()
    engine.dispose()
    _migrate(engine)
    return safety


def _migrate(engine: Engine) -> None:
    """The migrations read the database address from the environment."""
    previous = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = engine.url.render_as_string(hide_password=False)
    try:
        command.upgrade(Config(str(ROOT / "alembic.ini")), "head")
    finally:
        if previous is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous
