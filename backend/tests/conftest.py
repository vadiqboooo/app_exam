import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from app.config import ROOT, Settings
from app.database import make_engine
from app.main import create_app


@pytest.fixture
def database_url(tmp_path, monkeypatch):
    url = f"sqlite:///{(tmp_path / 'probnik.db').as_posix()}"
    monkeypatch.setenv("DATABASE_URL", url)
    command.upgrade(Config(str(ROOT / "alembic.ini")), "head")
    return url


@pytest.fixture
def engine(database_url):
    engine = make_engine(database_url)
    yield engine
    engine.dispose()


@pytest.fixture
def client(database_url, tmp_path):
    # Drive files point into the temp folder so a developer's real client_secret.json is not used.
    app = create_app(
        Settings(
            database_url=database_url,
            api_key="test-key",
            gdrive_file=str(tmp_path / "drive.json"),
            webdav_file=str(tmp_path / "webdav.json"),
            folder_file=str(tmp_path / "folder.json"),
            yandex_file=str(tmp_path / "yandex.json"),
            gdrive_client_file=str(tmp_path / "client_secret.json"),
        )
    )
    with TestClient(app, headers={"Authorization": "Bearer test-key"}) as client:
        yield client
