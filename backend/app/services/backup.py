import sqlite3
from pathlib import Path

from sqlalchemy.engine import Engine


def backup_database(engine: Engine, destination: Path) -> Path:
    if engine.dialect.name != "sqlite":
        raise ValueError("Этот backup предназначен для SQLite; для PostgreSQL используйте pg_dump")
    destination = destination.resolve()
    source = engine.url.database
    if source and destination == Path(source).resolve():
        raise ValueError("Путь резервной копии совпадает с рабочей базой")
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation prevents accidental overwrite of a previous backup.
    with destination.open("xb"):
        pass
    try:
        connection = engine.raw_connection()
        try:
            target = sqlite3.connect(destination)
            try:
                connection.driver_connection.backup(target)
            finally:
                target.close()
        finally:
            connection.close()
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    return destination
