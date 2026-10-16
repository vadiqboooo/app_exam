import importlib.util
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "deploy.py"
needs_git = pytest.mark.skipif(shutil.which("git") is None, reason="git is not installed")


@pytest.fixture(scope="module")
def deploy():
    spec = importlib.util.spec_from_file_location("deploy_rollback_script", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture(autouse=True)
def no_real_state(deploy, monkeypatch, tmp_path):
    monkeypatch.setattr(deploy, "STATE_FILE", tmp_path / ".deploy.json")
    monkeypatch.setattr(deploy, "saved_password", lambda host, user: None)
    monkeypatch.setenv("DEPLOY_PASSWORD", "secret-pass")


def git(cwd, *args):
    env = {
        **os.environ,
        "GIT_AUTHOR_NAME": "t",
        "GIT_AUTHOR_EMAIL": "t@example.com",
        "GIT_COMMITTER_NAME": "t",
        "GIT_COMMITTER_EMAIL": "t@example.com",
    }
    done = subprocess.run(
        ["git", "-C", str(cwd), *args], check=True, capture_output=True, text=True, env=env
    )
    return done.stdout.strip()


def commit(repo, name, content, message, folder="backend/app"):
    path = repo / folder / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    git(repo, "add", ".")
    git(repo, "commit", "-m", message)
    return git(repo, "rev-parse", "HEAD")


@pytest.fixture
def repo(tmp_path):
    root = tmp_path / "project"
    root.mkdir()
    git(root, "init", "-b", "main")
    return root


@needs_git
def test_versions_are_listed_newest_first_with_their_tags(deploy, repo):
    first = commit(repo, "main.py", "one", "first version")
    git(repo, "tag", "v1")
    commit(repo, "main.py", "two", "second version")

    versions = deploy.list_versions(repo)
    assert [item["subject"] for item in versions] == ["second version", "first version"]
    assert versions[1]["tags"] == ["v1"] and versions[1]["commit"] == first
    assert versions[0]["short"] == versions[0]["commit"][:7]

    assert deploy.resolve_version(repo, "v1") == (first, first[:7])
    with pytest.raises(deploy.DeployError, match="нет версии"):
        deploy.resolve_version(repo, "no-such-version")


@needs_git
def test_a_version_is_taken_out_of_git_and_the_working_folder_is_left_alone(
    deploy, repo, tmp_path
):
    first = commit(repo, "main.py", "old code", "first")
    commit(repo, "main.py", "new code", "second")
    (repo / "backend" / "app" / "main.py").write_text("my unsaved edit", encoding="utf-8")

    out = tmp_path / "exported"
    out.mkdir()
    deploy.export_version(repo, first, out)

    assert (out / "backend" / "app" / "main.py").read_text(encoding="utf-8") == "old code"
    assert (repo / "backend" / "app" / "main.py").read_text(encoding="utf-8") == "my unsaved edit"


@needs_git
def test_a_changed_database_schema_is_noticed_between_two_versions(deploy, repo):
    first = commit(repo, "main.py", "one", "first")
    second = commit(repo, "main.py", "two", "code only")
    third = commit(repo, "a.py", "revision = 'a'", "new migration", folder="backend/migrations")

    assert not deploy.schema_changed(repo, first, second)  # only the code differs
    assert deploy.schema_changed(repo, first, third)
    assert deploy.schema_changed(repo, first, "0" * 40)  # unknown counts as changed


@needs_git
def test_an_older_folder_is_told_apart_from_a_newer_server(deploy, repo):
    old = commit(repo, "main.py", "one", "first")
    new = commit(repo, "main.py", "two", "second")
    assert deploy.is_behind(repo, old, new)  # this folder is older than the server
    assert not deploy.is_behind(repo, new, old)  # the server is the older one
    assert not deploy.is_behind(repo, new, new)
    assert not deploy.is_behind(repo, new, "0" * 40)  # a version git does not know: no verdict


def test_database_copies_say_which_version_they_belong_to(deploy):
    script = "\n".join(deploy.backup_lines("a1b2c3d"))
    assert "-from-a1b2c3d.tar.gz" in script and "/var/backups/probnik-updates" in script
    assert "tail -n +11" in script  # the last ten are kept
    assert deploy.backup_tag("a1b2c3d+правки").startswith("a1b2c3d_")
    assert "/" not in deploy.backup_tag("x/../y") and deploy.backup_tag(None) == "unknown"


def test_restoring_a_copy_clears_the_old_database_files_first(deploy):
    lines = deploy.restore_db_lines("/var/backups/probnik-updates/probnik-1-from-a1b2c3d.tar.gz")
    script = "\n".join(lines)
    assert "systemctl stop probnik" in script
    assert script.index("rm -f probnik.db") < script.index("tar -xzf")  # no stale -wal left
    assert "chown probnik:probnik" in script


def run(deploy, capsys, *args):
    code = deploy.main(["--dry-run", "--yes", "--host", "203.0.113.10", *args])
    return code, capsys.readouterr().out


def test_rollback_dry_run_shows_the_whole_way_back(deploy, capsys):
    code, out = run(deploy, capsys, "--rollback", "--to", "a1b2c3d")
    assert code == 0
    for number in range(1, 10):
        assert f"[{number}/9]" in out
    for expected in (
        "версия a1b2c3d",
        "Сверяю схему базы данных",
        "-from-unknown.tar.gz",  # a copy of the current database first
        "uv sync --frozen --no-dev",
        "systemctl restart probnik",
        "Версия возвращена",
    ):
        assert expected in out
    assert "secret-pass" not in out


def test_rollback_needs_to_know_the_version_when_nobody_can_be_asked(deploy, capsys):
    code, out = run(deploy, capsys, "--rollback")
    assert code == 2 and "--to" in out
