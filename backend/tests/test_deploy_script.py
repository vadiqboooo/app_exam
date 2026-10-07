import importlib.util
import sys
import tarfile
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "deploy.py"


@pytest.fixture(scope="module")
def deploy():
    spec = importlib.util.spec_from_file_location("deploy_script", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module  # dataclasses look the module up by name
    spec.loader.exec_module(module)  # paramiko is only imported when a real connection is made
    return module


def make_project(root: Path, built: bool = True):
    files = {
        "backend/pyproject.toml": "[project]\n",
        "backend/uv.lock": "version = 1\n",
        "backend/alembic.ini": "[alembic]\n",
        "backend/app/main.py": "print('app')\n",
        "backend/app/__pycache__/main.cpython-312.pyc": "bytecode",
        "backend/migrations/versions/a.py": "revision = 'a'\n",
        # things that must never reach the server
        "backend/data/probnik.db": "students",
        "backend/data/yandex.json": '{"token": "secret"}',
        "backend/client_secret.json": '{"web": {}}',
        "backend/robot-key.json": "{}",
        "backend/.env": "API_KEY=x",
        "backend/.venv/bin/python": "x",
        "backend/tests/test_api.py": "x",
        "backend/desktop.py": "x",
        "backend/Probnik.spec": "x",
        "backend/before-restore/before-restore-1.db": "old data",
        "backend/app/local.db": "x",
    }
    if built:
        files["frontend/dist/index.html"] = "<html></html>"
        files["frontend/dist/assets/app.js"] = "console.log(1)"
        files["frontend/dist/.env"] = "SECRET=1"
    for name, content in files.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")


def test_archive_holds_the_app_and_nothing_private(deploy, tmp_path):
    make_project(tmp_path)
    out = tmp_path / "release.tar.gz"
    names = deploy.build_archive(tmp_path, out)
    with tarfile.open(out) as archive:
        assert sorted(archive.getnames()) == sorted(names)
    assert set(names) == {
        "backend/pyproject.toml",
        "backend/uv.lock",
        "backend/alembic.ini",
        "backend/app/main.py",
        "backend/migrations/versions/a.py",
        "frontend/dist/index.html",
        "frontend/dist/assets/app.js",
    }


def test_archive_needs_the_built_frontend_and_the_lock_file(deploy, tmp_path):
    make_project(tmp_path, built=False)
    with pytest.raises(deploy.DeployError, match="frontend/dist"):
        deploy.build_archive(tmp_path, tmp_path / "x.tar.gz")
    make_project(tmp_path)
    (tmp_path / "backend" / "uv.lock").unlink()
    with pytest.raises(deploy.DeployError, match="uv.lock"):
        deploy.build_archive(tmp_path, tmp_path / "x.tar.gz")


def test_environment_file_and_key_reading(deploy):
    text = deploy.render_env("code-123", "abc12345")
    assert "API_KEY=code-123\n" in text
    assert "DATABASE_URL=sqlite:////opt/probnik/backend/data/probnik.db\n" in text
    assert "YANDEX_CLIENT_ID=abc12345\n" in text
    assert "YANDEX_CLIENT_ID" not in deploy.render_env("code-123", None)
    assert deploy.parse_env_value(text, "API_KEY") == "code-123"
    assert deploy.parse_env_value(text, "NOPE") is None


def test_web_server_and_service_files(deploy):
    plain = deploy.render_nginx(None)
    assert "server_name _;" in plain and "proxy_pass http://127.0.0.1:8000;" in plain
    assert "client_max_body_size 50m;" in plain and "X-Forwarded-Proto $scheme" in plain
    assert "server_name school.example.com;" in deploy.render_nginx("school.example.com")
    unit = deploy.render_unit()
    assert "--factory" in unit and "--host 127.0.0.1" in unit and "User=probnik" in unit
    assert "EnvironmentFile=/etc/probnik.env" in unit and "Restart=always" in unit


def test_what_the_person_types_is_checked(deploy):
    assert deploy.valid_host("203.0.113.10") and deploy.valid_host("vps.example.com")
    assert not deploy.valid_host("not a host") and not deploy.valid_host("999.1.1.1")
    assert deploy.valid_domain("school.example.com") and not deploy.valid_domain("203.0.113.10")
    assert not deploy.valid_domain("localhost")
    assert deploy.valid_email("me@example.com") and not deploy.valid_email("me@")
    assert deploy.valid_client_id("4f2c9d8e7a6b5c4d") and not deploy.valid_client_id("short")
    assert not deploy.valid_client_id("has space and symbols!")


class FakeRemote:
    def __init__(self, env_text=None):
        self.env_text, self.written = env_text, {}

    def read(self, path):
        return self.env_text

    def write(self, path, content, mode="644", owner="root:root"):
        self.written[path] = (content, mode, owner)


def config(deploy, **options):
    values = {
        "host": "203.0.113.10",
        "port": 22,
        "user": "root",
        "password": "secret-pass",
        "domain": None,
        "email": None,
        "yandex_client_id": None,
        "yandex_token": None,
        "dry_run": False,
        "yes": True,
        "skip_build": True,
        "restore_latest": False,
        "action": "deploy",
        "delete_data": False,
    }
    values.update(options)
    return deploy.Config(**values)


def test_the_access_code_is_made_once_and_kept(deploy):
    first = FakeRemote()
    code = deploy.configure(first, config(deploy, yandex_client_id="abc12345"))
    assert len(code) >= 20
    content, mode, owner = first.written["/etc/probnik.env"]
    assert f"API_KEY={code}" in content and "YANDEX_CLIENT_ID=abc12345" in content
    assert (mode, owner) == ("640", "root:probnik")  # readable by the service, not by everyone
    assert "/opt/probnik/backend/data/yandex.json" not in first.written  # no token, no file

    again = FakeRemote(env_text=content)
    assert deploy.configure(again, config(deploy)) == code  # a re-run must not lock anyone out


def test_the_yandex_token_is_saved_privately(deploy):
    remote = FakeRemote()
    deploy.configure(remote, config(deploy, yandex_client_id="abc12345", yandex_token="tok_SECRET"))
    content, mode, owner = remote.written["/opt/probnik/backend/data/yandex.json"]
    assert '"token": "tok_SECRET"' in content and (mode, owner) == ("600", "probnik:probnik")


ARGS = ["--dry-run", "--yes", "--host", "203.0.113.10"]


def run(deploy, monkeypatch, capsys, extra, password="secret-pass"):
    monkeypatch.setenv("DEPLOY_PASSWORD", password)
    monkeypatch.setattr(deploy, "STATE_FILE", Path("does-not-exist/.deploy.json"))
    code = deploy.main(ARGS + extra)
    return code, capsys.readouterr().out


def test_dry_run_shows_every_step_and_leaks_nothing(deploy, monkeypatch, capsys):
    extra = [
        "--domain", "school.example.com", "--email", "me@example.com",
        "--yandex-client-id", "abc12345", "--yandex-token", "tok_SECRET",
    ]  # fmt: skip
    code, out = run(deploy, monkeypatch, capsys, extra)
    assert code == 0
    for number in range(1, 13):
        assert f"[{number}/12]" in out
    for expected in (
        "Настраиваю VPS",
        "Делаю развёртывание",
        "uv sync --frozen --no-dev",
        "python -m app init-db",
        "systemctl enable probnik",
        "certbot --nginx -d school.example.com",
        "/opt/probnik/backend/data/yandex.json",
        "Код доступа",
        "policy-rc.d",
    ):
        assert expected in out
    assert "ufw --force enable" not in out and "ufw enable" not in out  # never switched on here
    assert "secret-pass" not in out and "tok_SECRET" not in out


def test_without_a_domain_there_is_no_https_step(deploy, monkeypatch, capsys):
    code, out = run(deploy, monkeypatch, capsys, [])
    assert code == 0 and "[11/11]" in out and "[12/" not in out
    assert "certbot" not in out and "uv run scripts/deploy.py --domain" in out
    assert "ID приложения Яндекса не указан" in out


def test_the_password_is_required_unless_it_is_a_dry_run(deploy, monkeypatch, capsys):
    monkeypatch.delenv("DEPLOY_PASSWORD", raising=False)
    monkeypatch.setattr(deploy, "STATE_FILE", Path("does-not-exist/.deploy.json"))
    assert deploy.main(["--yes", "--host", "203.0.113.10"]) == 2
    assert "DEPLOY_PASSWORD" in capsys.readouterr().out


def test_a_domain_needs_an_email_and_wrong_input_is_refused(deploy, monkeypatch, capsys):
    code, out = run(deploy, monkeypatch, capsys, ["--domain", "school.example.com"])
    assert code == 2 and "e-mail" in out
    code, out = run(deploy, monkeypatch, capsys, ["--yandex-client-id", "no spaces!"])
    assert code == 2 and "ID приложения" in out
    code, _ = run(deploy, monkeypatch, capsys, ["--domain", "203.0.113.10", "--email", "a@b.cc"])
    assert code == 2


class FakeNpm:
    def __init__(self):
        self.calls = []

    def __call__(self, args, cwd):
        self.calls.append(list(args))
        return type("Done", (), {"returncode": 0, "stdout": "", "stderr": ""})()


def test_packages_are_installed_once_and_a_later_run_only_builds(deploy, monkeypatch, tmp_path):
    (tmp_path / "frontend").mkdir()
    npm = FakeNpm()
    monkeypatch.setattr(deploy, "npm_runner", lambda: npm)
    deploy.build_frontend(tmp_path, skip=False)
    assert npm.calls == [["ci"], ["run", "build"]]  # a clean checkout has no node_modules
    npm.calls.clear()
    (tmp_path / "frontend" / "node_modules").mkdir()
    deploy.build_frontend(tmp_path, skip=False)
    assert npm.calls == [["run", "build"]]


def test_a_failed_build_shows_the_end_of_the_output(deploy, monkeypatch, tmp_path):
    (tmp_path / "frontend").mkdir()

    def broken(args, cwd):
        return type("Done", (), {"returncode": 1, "stdout": "line 1\n", "stderr": "boom"})()

    monkeypatch.setattr(deploy, "npm_runner", lambda: broken)
    with pytest.raises(deploy.DeployError, match="(?s)npm ci.*boom"):
        deploy.build_frontend(tmp_path, skip=False)


def test_without_npm_the_built_interface_is_used_or_the_reason_is_given(
    deploy, monkeypatch, tmp_path
):
    (tmp_path / "frontend").mkdir()
    monkeypatch.setattr(deploy, "npm_runner", lambda: None)
    with pytest.raises(deploy.DeployError, match="npm"):
        deploy.build_frontend(tmp_path, skip=False)
    (tmp_path / "frontend" / "dist").mkdir()
    (tmp_path / "frontend" / "dist" / "index.html").write_text("<html></html>")
    deploy.build_frontend(
        tmp_path, skip=False
    )  # nothing to build with, but a finished build exists
    deploy.build_frontend(tmp_path, skip=True)


def test_npm_comes_from_the_python_package_when_it_is_not_installed(deploy, monkeypatch, tmp_path):
    pytest.importorskip("nodejs_wheel")
    monkeypatch.setattr(deploy.shutil, "which", lambda name: None)
    runner = deploy.npm_runner()
    assert runner is not None
    result = runner(["--version"], tmp_path)
    assert result.returncode == 0 and result.stdout.strip()[0].isdigit()
