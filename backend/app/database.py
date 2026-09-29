from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session


def make_engine(url: str):
    parsed = make_url(url)
    sqlite = parsed.get_backend_name() == "sqlite"
    if sqlite and parsed.database and parsed.database != ":memory:":
        Path(parsed.database).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        url, connect_args={"check_same_thread": False, "timeout": 30} if sqlite else {}
    )
    if sqlite:

        @event.listens_for(engine, "connect")
        def configure(connection, _):
            connection.isolation_level = None
            cursor = connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.close()

        @event.listens_for(engine, "begin")
        def begin(connection):
            mode = " IMMEDIATE" if connection.get_execution_options().get("write") else ""
            connection.exec_driver_sql("BEGIN" + mode)

    return engine


@contextmanager
def transaction(engine, *, write=False):
    with engine.connect().execution_options(write=write) as connection:
        with Session(connection, expire_on_commit=False) as session, session.begin():
            yield session
