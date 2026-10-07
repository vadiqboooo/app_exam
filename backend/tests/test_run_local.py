import importlib.util
import os
import socket
import sys
import time
from argparse import Namespace
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "run_local.py"


@pytest.fixture(scope="module")
def local():
    spec = importlib.util.spec_from_file_location("run_local_script", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_data_lives_in_the_users_own_folder_not_in_the_project(local):
    folder = local.default_data_dir()
    assert folder.name == "Probnik"
    assert local.ROOT not in folder.parents and folder.is_absolute()


def test_state_is_remembered(local, tmp_path):
    assert local.load_state(tmp_path / "nothing-here") == {}
    state = {"api_key": "abc", "yandex_client_id": "id12345678"}
    local.save_state(tmp_path / "data", state)
    assert local.load_state(tmp_path / "data") == state


def test_the_interface_is_rebuilt_only_when_needed(local, tmp_path):
    frontend = tmp_path / "frontend"
    (frontend / "src").mkdir(parents=True)
    source = frontend / "src" / "App.tsx"
    source.write_text("x")
    assert local.needs_build(tmp_path)  # no build yet
    (frontend / "dist").mkdir()
    index = frontend / "dist" / "index.html"
    index.write_text("<html></html>")
    now = time.time()
    os.utime(source, (now - 100, now - 100))
    os.utime(index, (now, now))
    assert not local.needs_build(tmp_path)  # the build is newer than the sources
    os.utime(source, (now + 50, now + 50))
    assert local.needs_build(tmp_path)  # a source changed after the build


def test_a_busy_port_is_skipped(local):
    with socket.socket() as busy:
        busy.bind(("127.0.0.1", 0))
        busy.listen()
        port = busy.getsockname()[1]
        assert local.free_port(port, 5) != port
    with socket.socket() as taken:
        taken.bind(("127.0.0.1", 0))
        taken.listen()
        with pytest.raises(local.deploy.DeployError, match="порты"):
            local.free_port(taken.getsockname()[1], 1)


def test_the_server_gets_its_own_data_and_the_yandex_app_id(local, tmp_path, monkeypatch):
    monkeypatch.setenv("VIRTUAL_ENV", "C:/somewhere")
    state = {"api_key": "code-1", "yandex_client_id": "id12345678"}
    env = local.server_env(tmp_path / "Probnik", state)
    assert env["API_KEY"] == "code-1" and env["YANDEX_CLIENT_ID"] == "id12345678"
    assert env["DATABASE_URL"].startswith("sqlite:///")
    assert env["DATABASE_URL"].endswith("/probnik.db")
    for name in ("YANDEX_FILE", "FOLDER_FILE", "GDRIVE_FILE", "WEBDAV_FILE"):
        assert Path(env[name]).parent == tmp_path / "Probnik"  # tokens stay out of the project
    assert "VIRTUAL_ENV" not in env  # the project's own environment must be used
    assert "YANDEX_CLIENT_ID" not in local.server_env(tmp_path, {"api_key": "code-1"})


def args(**options):
    values = {"yandex_client_id": None, "yandex_token": None, "yes": True}
    values.update(options)
    return Namespace(**values)


def test_the_yandex_app_id_is_taken_from_the_arguments_or_remembered(local):
    given = args(yandex_client_id="abc123def4", yandex_token=" tok ")
    state, token = local.ask_first_time(given, {})
    assert state["yandex_client_id"] == "abc123def4" and state["asked"] and token == "tok"
    state, token = local.ask_first_time(args(), state)  # a later run keeps the id
    assert state["yandex_client_id"] == "abc123def4" and token is None
    state, _ = local.ask_first_time(args(), {})
    assert state["yandex_client_id"] is None
    with pytest.raises(local.deploy.DeployError, match="ID приложения"):
        local.ask_first_time(args(yandex_client_id="bad id!"), {})


def test_a_failed_step_shows_what_went_wrong(local, tmp_path):
    local.run([sys.executable, "-c", "pass"], cwd=tmp_path, env=dict(os.environ))
    command = [sys.executable, "-c", "import sys; print('details'); sys.exit(3)"]
    with pytest.raises(local.deploy.DeployError, match="details"):
        local.run(command, cwd=tmp_path, env=dict(os.environ))
