import importlib.util
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "deploy.py"


@pytest.fixture(scope="module")
def deploy():
    spec = importlib.util.spec_from_file_location("deploy_manage_script", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture(autouse=True)
def no_real_state(deploy, monkeypatch, tmp_path):
    """Neither the real state file nor the real password store is touched."""
    monkeypatch.setattr(deploy, "STATE_FILE", tmp_path / ".deploy.json")
    monkeypatch.setattr(deploy, "saved_password", lambda host, user: None)
    monkeypatch.setenv("DEPLOY_PASSWORD", "secret-pass")


def run(deploy, capsys, *args):
    code = deploy.main(["--dry-run", "--yes", "--host", "203.0.113.10", *args])
    return code, capsys.readouterr().out


def test_the_access_code_in_the_environment_file_is_replaced_in_place(deploy):
    env = "API_KEY=old\nDATABASE_URL=sqlite:///x.db\nYANDEX_CLIENT_ID=abc\n"
    changed = deploy.replace_env_value(env, "API_KEY", "NewSecret123")
    assert changed == "API_KEY=NewSecret123\nDATABASE_URL=sqlite:///x.db\nYANDEX_CLIENT_ID=abc\n"
    assert deploy.replace_env_value("A=1\n", "API_KEY", "K").splitlines() == ["A=1", "API_KEY=K"]


def test_a_new_access_code_is_checked(deploy):
    assert deploy.valid_access_code("NewSecret123")
    assert deploy.valid_access_code("a-b_c.d~e1234")
    for bad in ("short", "has space 123", "quote'12345678", "кириллица1234", "x" * 65):
        assert not deploy.valid_access_code(bad)


def test_update_shows_every_step_and_never_touches_the_access_code(deploy, capsys):
    code, out = run(deploy, capsys, "--update")
    assert code == 0
    for number in range(1, 10):
        assert f"[{number}/9]" in out
    for expected in (
        "git pull пропущен",
        "probnik-updates",  # a copy of the database before the update
        "tar -czf",
        "uv sync --frozen --no-dev",
        "python -m app init-db",
        "systemctl restart probnik",
        "Приложение обновлено",
    ):
        assert expected in out
    assert "API_KEY=" not in out and "secret-pass" not in out


def test_the_access_code_can_be_shown(deploy, capsys):
    code, out = run(deploy, capsys, "--show-code")
    assert code == 0 and "Код доступа администратора" in out and "secret-pass" not in out


def test_a_new_access_code_is_written_and_the_app_restarted_without_leaking_it(deploy, capsys):
    code, out = run(deploy, capsys, "--set-code", "--code", "NewSecret123")
    assert code == 0
    assert "/etc/probnik.env" in out and "systemctl restart probnik" in out
    assert "NewSecret123" not in out and "secret-pass" not in out  # hidden in a dry run


def test_a_bad_access_code_is_refused_before_anything_happens(deploy, capsys):
    code, out = run(deploy, capsys, "--set-code", "--code", "short")
    assert code == 2 and "8-64 символа" in out


def test_the_saved_server_and_password_are_used_without_asking(deploy, monkeypatch):
    deploy.STATE_FILE.write_text(
        json.dumps({"host": "203.0.113.77", "user": "admin", "port": 2222}), encoding="utf-8"
    )
    monkeypatch.delenv("DEPLOY_PASSWORD")
    monkeypatch.setattr(deploy, "saved_password", lambda host, user: f"pw-{user}@{host}")
    cfg = deploy.collect(deploy.parse_args(["--yes", "--status"]))
    assert (cfg.host, cfg.user, cfg.port) == ("203.0.113.77", "admin", 2222)
    assert cfg.password == "pw-admin@203.0.113.77" and cfg.password_saved
    assert cfg.action == "status"


def test_flags_override_what_is_saved(deploy):
    deploy.STATE_FILE.write_text(
        json.dumps({"host": "203.0.113.77", "user": "admin"}), encoding="utf-8"
    )
    argv = ["--yes", "--status", "--host", "203.0.113.5", "--user", "root", "--port", "22"]
    cfg = deploy.collect(deploy.parse_args(argv))
    assert (cfg.host, cfg.user, cfg.port) == ("203.0.113.5", "root", 22)


def test_without_a_password_anywhere_the_script_says_so(deploy, monkeypatch, capsys):
    monkeypatch.delenv("DEPLOY_PASSWORD")
    assert deploy.main(["--yes", "--status", "--host", "203.0.113.10"]) == 2
    assert "DEPLOY_PASSWORD" in capsys.readouterr().out


def test_forgetting_removes_the_saved_password(deploy, monkeypatch, capsys):
    removed = []
    monkeypatch.setattr(
        deploy, "forget_password", lambda host, user: removed.append((host, user)) or True
    )
    code, out = run(deploy, capsys, "--forget")
    assert code == 0 and removed == [("203.0.113.10", "root")] and "удалён" in out


def test_the_server_is_remembered_without_secrets(deploy):
    cfg = deploy.Config(
        host="203.0.113.10", port=22, user="root", password="secret-pass", domain=None,
        email=None, yandex_client_id=None, yandex_token=None, dry_run=False, yes=True,
        skip_build=True, restore_latest=False, action="status", delete_data=False,
    )  # fmt: skip
    deploy.save_server(cfg)
    text = deploy.STATE_FILE.read_text(encoding="utf-8")
    assert json.loads(text) == {"host": "203.0.113.10", "user": "root", "port": 22}
    assert "secret-pass" not in text


needs_git = pytest.mark.skipif(shutil.which("git") is None, reason="git is not installed")


def git(cwd, *args):
    env = {
        **os.environ,
        "GIT_AUTHOR_NAME": "t",
        "GIT_AUTHOR_EMAIL": "t@example.com",
        "GIT_COMMITTER_NAME": "t",
        "GIT_COMMITTER_EMAIL": "t@example.com",
    }
    subprocess.run(["git", "-C", str(cwd), *args], check=True, capture_output=True, env=env)


@pytest.fixture
def repos(tmp_path):
    """The git server, the clone the person deploys from and the clone somebody else pushes from."""
    origin, mine, other = tmp_path / "origin.git", tmp_path / "mine", tmp_path / "other"
    subprocess.run(["git", "init", "--bare", "-b", "main", str(origin)], check=True, capture_output=True)
    subprocess.run(["git", "clone", str(origin), str(other)], check=True, capture_output=True)
    (other / "app.txt").write_text("one", encoding="utf-8")
    git(other, "add", ".")
    git(other, "commit", "-m", "first")
    git(other, "push", "origin", "HEAD:main")
    subprocess.run(["git", "clone", str(origin), str(mine)], check=True, capture_output=True)
    return mine, other


@needs_git
def test_updates_pushed_to_git_are_pulled_before_the_build(deploy, repos):
    mine, other = repos
    (other / "app.txt").write_text("two", encoding="utf-8")
    git(other, "commit", "-am", "second change")
    git(other, "push", "origin", "HEAD:main")

    version, notes = deploy.fetch_updates(mine)
    assert (mine / "app.txt").read_text(encoding="utf-8") == "two"
    assert version and "+" not in version
    assert any("получены обновления" in note for note in notes)
    assert any("second change" in note for note in notes)

    again_version, again = deploy.fetch_updates(mine)
    assert again_version == version and any("версия та же" in note for note in again)


@needs_git
def test_unsaved_work_on_this_computer_is_never_overwritten_by_a_pull(deploy, repos):
    mine, other = repos
    (other / "app.txt").write_text("remote", encoding="utf-8")
    git(other, "commit", "-am", "remote change")
    git(other, "push", "origin", "HEAD:main")
    (mine / "app.txt").write_text("my edit", encoding="utf-8")

    version, notes = deploy.fetch_updates(mine)
    assert (mine / "app.txt").read_text(encoding="utf-8") == "my edit"
    assert version.endswith("+правки")
    assert any("незакоммиченные изменения" in note for note in notes)


@needs_git
def test_a_failed_pull_stops_the_update_with_the_reason(deploy, repos):
    mine, other = repos
    (mine / "app.txt").write_text("mine", encoding="utf-8")
    git(mine, "commit", "-am", "local only")
    (other / "app.txt").write_text("theirs", encoding="utf-8")
    git(other, "commit", "-am", "diverged")
    git(other, "push", "origin", "HEAD:main")
    with pytest.raises(deploy.DeployError, match="Не удалось получить обновления"):
        deploy.fetch_updates(mine)


def test_without_git_the_files_on_this_computer_are_used(deploy, tmp_path):
    version, notes = deploy.fetch_updates(tmp_path)
    assert version is None and "не git-репозиторий" in notes[0]
