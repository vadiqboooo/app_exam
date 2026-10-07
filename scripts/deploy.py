# /// script
# requires-python = ">=3.10"
# dependencies = ["paramiko>=3.4", "nodejs-wheel-binaries>=22"]
# ///
"""Разворачивает «Гарри — пробники» на VPS (Ubuntu / Debian) одной командой.

    uv run scripts/deploy.py

Скрипт спросит IP и пароль VPS, при желании домен, ID приложения Яндекса и токен Яндекса, и по
шагам: соберёт приложение, настроит VPS, выложит приложение, запустит его и выдаст код доступа для
первого входа. Его можно запускать повторно: он обновит приложение, не трогая данные и код доступа.
Домен потом добавляется повторным запуском с `--domain ваш.домен`.

Если на сервере уже работает другой проект, скрипт его не трогает: смотрит занятые порты,
не включает файрвол сам и не переписывает чужие сайты nginx. Приложение выключается и
удаляется тем же скриптом: `--stop`, `--start`, `--uninstall`.
"""

from __future__ import annotations

import argparse
import base64
import fnmatch
import getpass
import hashlib
import ipaddress
import json
import os
import re
import secrets
import shlex
import shutil
import socket
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATE_FILE = Path(__file__).with_name(".deploy.json")

APP_DIR = "/opt/probnik"
BACKEND_DIR = f"{APP_DIR}/backend"
DATA_DIR = f"{BACKEND_DIR}/data"
ENV_FILE = "/etc/probnik.env"
SERVICE = "probnik"
DEFAULT_APP_PORT = 8000  # the first port tried for the app; the next free one if it is taken
ALT_PORTS_FROM = 8080  # where the site goes when port 80 belongs to something else
STATE_PATH = f"{APP_DIR}/deploy-state.json"  # what this script did here, to undo exactly that
SITE_AVAILABLE = "/etc/nginx/sites-available/probnik"
SITE_ENABLED = "/etc/nginx/sites-enabled/probnik"
SAVED_DATA_ROOT = "/var/backups"  # where the data goes when the app is removed

# What never goes to the server: local data, keys, caches, tests and the desktop build.
EXCLUDED_DIRS = {
    ".git",
    ".venv",
    "__pycache__",
    "data",
    "build",
    "dist",
    "tests",
    "node_modules",
    ".pytest_cache",
    ".ruff_cache",
    "before-restore",
    "backups",
}
EXCLUDED_BACKEND_FILES = {"Probnik.spec", "desktop.py"}
SECRET_PATTERNS = (
    "client_secret*.json",
    "*-key.json",
    ".env",
    ".env.*",
    "*.db",
    "*.db-*",
    "*.sqlite",
    "*.sqlite3",
    "*.pyc",
    "drive.json",
    "yandex.json",
    "webdav.json",
    "folder.json",
)


class DeployError(Exception):
    """A problem the person can act on; shown without a traceback."""


# ---------------------------------------------------------------- output


def _enable_colors() -> bool:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if os.name == "nt":
        os.system("")  # lets the Windows console understand colour codes
    return sys.stdout.isatty() and os.environ.get("NO_COLOR") is None


COLORS = _enable_colors()


def paint(text: str, code: str) -> str:
    return f"\033[{code}m{text}\033[0m" if COLORS else text


def say(text: str = "") -> None:
    print(text, flush=True)


class Progress:
    def __init__(self, total: int):
        self.total, self.index = total, 0

    def step(self, title: str) -> Step:
        self.index += 1
        return Step(self.index, self.total, title)


class Step:
    def __init__(self, index: int, total: int, title: str):
        self.index, self.total, self.title = index, total, title
        self.started = 0.0

    def __enter__(self) -> Step:
        self.started = time.monotonic()
        say(paint(f"[{self.index}/{self.total}] {self.title}…", "1;36"))
        return self

    def note(self, text: str) -> None:
        say(f"      {text}")

    def __exit__(self, kind, error, trace) -> bool:
        seconds = time.monotonic() - self.started
        if error is None:
            say(paint(f"      ✓ готово ({seconds:.0f} с)", "32"))
            return False
        say(paint(f"      ✗ не получилось: {error}", "31"))
        return False


# ---------------------------------------------------------------- validation


def valid_host(value: str) -> bool:
    try:
        ipaddress.ip_address(value)
        return True
    except ValueError:
        if re.fullmatch(r"[\d.]+", value):
            return False  # something like 999.1.1.1 is a mistyped address, not a name
        return bool(
            re.fullmatch(r"[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9-]+)+", value)
        )


def valid_domain(value: str) -> bool:
    try:
        ipaddress.ip_address(value)
        return False
    except ValueError:
        return bool(re.fullmatch(r"([A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}", value))


def valid_email(value: str) -> bool:
    return bool(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value))


def valid_client_id(value: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9]{8,64}", value))


# ---------------------------------------------------------------- what is rendered for the server


def render_env(api_key: str, yandex_client_id: str | None) -> str:
    lines = [f"API_KEY={api_key}", f"DATABASE_URL=sqlite:///{DATA_DIR}/probnik.db"]
    if yandex_client_id:
        lines.append(f"YANDEX_CLIENT_ID={yandex_client_id}")
    return "\n".join(lines) + "\n"


def parse_env_value(text: str, name: str) -> str | None:
    for line in text.splitlines():
        if line.startswith(f"{name}="):
            return line.split("=", 1)[1].strip() or None
    return None


def render_unit(app_port: int = DEFAULT_APP_PORT) -> str:
    command = (
        f"{BACKEND_DIR}/.venv/bin/uvicorn app.main:create_app --factory --host 127.0.0.1 "
        f"--port {app_port} --proxy-headers --forwarded-allow-ips=127.0.0.1"
    )
    return f"""[Unit]
Description=Probnik exams
After=network.target

[Service]
User=probnik
Group=probnik
WorkingDirectory={BACKEND_DIR}
EnvironmentFile={ENV_FILE}
ExecStart={command}
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
"""


def render_nginx(
    domain: str | None,
    app_port: int = DEFAULT_APP_PORT,
    public_port: int = 80,
    default_server: bool | None = None,
) -> str:
    """Our own site only. It never claims to be the catch-all unless the plan says so."""
    if default_server is None:
        default_server = domain is None and public_port == 80
    flag = " default_server" if default_server else ""
    names = domain or "_"
    return f"""server {{
    listen {public_port}{flag};
    listen [::]:{public_port}{flag};
    server_name {names};
    client_max_body_size 50m;

    location / {{
        proxy_pass http://127.0.0.1:{app_port};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }}
}}
"""


def render_yandex(token: str) -> str:
    return json.dumps(
        {"token": token, "folder": "Probnik backups", "root": None}, ensure_ascii=False
    )


# ---------------------------------------------------------------- local build


def is_excluded_file(name: str, backend: bool) -> bool:
    if any(fnmatch.fnmatch(name, pattern) for pattern in SECRET_PATTERNS):
        return True
    return backend and name in EXCLUDED_BACKEND_FILES


def build_archive(root: Path, out: Path) -> list[str]:
    """Packs the backend code and the built frontend; secrets, data and caches are left out."""
    backend, dist = root / "backend", root / "frontend" / "dist"
    for needed in (backend / "pyproject.toml", backend / "uv.lock", backend / "alembic.ini"):
        if not needed.is_file():
            raise DeployError(f"В проекте нет файла {needed.relative_to(root).as_posix()}")
    if not (dist / "index.html").is_file():
        raise DeployError("Нет собранного интерфейса frontend/dist. Нужен Node.js (npm).")
    names: list[str] = []
    with tarfile.open(out, "w:gz") as archive:
        for base, prefix, skipped in (
            (backend, "backend", EXCLUDED_DIRS),
            (dist, "frontend/dist", set()),
        ):
            for folder, dirs, files in os.walk(base):
                dirs[:] = sorted(item for item in dirs if item not in skipped)
                for name in sorted(files):
                    if is_excluded_file(name, prefix == "backend"):
                        continue
                    path = Path(folder) / name
                    arcname = f"{prefix}/{path.relative_to(base).as_posix()}"
                    info = archive.gettarinfo(str(path), arcname)
                    info.uid = info.gid = 0
                    info.uname = info.gname = "root"
                    with path.open("rb") as handle:
                        archive.addfile(info, handle)
                    names.append(arcname)
    return names


def npm_runner():
    """Returns a function that runs npm: the installed one, or the one shipped as a Python package.

    The package (nodejs-wheel-binaries) is why a clean machine needs neither Node.js nor npm."""
    found = shutil.which("npm")
    if found:
        return lambda args, cwd: subprocess.run(
            [found, *args], cwd=cwd, capture_output=True, text=True
        )
    try:
        from nodejs_wheel import executable
    except ImportError:
        return None
    # npm runs the project's scripts (`tsc`, `vite`) as separate programs that look for `node`
    # on the PATH, so the folder of the packaged node must be there too.
    root = Path(executable.ROOT_DIR)
    node_dir = next(
        (p.parent for p in (root / "node.exe", root / "bin" / "node") if p.is_file()), root
    )
    env = {**os.environ, "PATH": f"{node_dir}{os.pathsep}{os.environ.get('PATH', '')}"}
    return lambda args, cwd: executable.npm(
        list(args),
        return_completed_process=True,
        cwd=cwd,
        env=env,
        capture_output=True,
        text=True,
    )


def build_frontend(root: Path, skip: bool) -> None:
    frontend = root / "frontend"
    npm = None if skip else npm_runner()
    if npm is None:
        if (frontend / "dist" / "index.html").is_file():
            say("      используется уже собранный frontend/dist")
            return
        raise DeployError("Не удалось собрать интерфейс: нет npm и нет готового frontend/dist")
    # Packages are installed once; a later run only rebuilds.
    commands = [] if (frontend / "node_modules").is_dir() else [["ci"]]
    for command in [*commands, ["run", "build"]]:
        result = npm(command, frontend)
        if result.returncode != 0:
            tail = "\n".join((result.stdout + result.stderr).strip().splitlines()[-12:])
            raise DeployError(f"`npm {' '.join(command)}` завершилась с ошибкой:\n{tail}")


# ---------------------------------------------------------------- settings


@dataclass
class Config:
    host: str
    port: int
    user: str
    password: str
    domain: str | None
    email: str | None
    yandex_client_id: str | None
    yandex_token: str | None
    dry_run: bool
    yes: bool
    skip_build: bool
    restore_latest: bool
    action: str  # deploy, stop, start or uninstall
    delete_data: bool
    app_port: int = DEFAULT_APP_PORT  # set from the plan once it is made

    @property
    def secrets(self) -> list[str]:
        return [value for value in (self.password, self.yandex_token) if value]


def load_state() -> dict:
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_state(cfg: Config) -> None:
    """Only what is not secret: the next run offers it as the default."""
    state = {
        "host": cfg.host,
        "domain": cfg.domain,
        "email": cfg.email,
        "yandex_client_id": cfg.yandex_client_id,
    }
    try:
        STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError:
        pass


def ask(
    prompt: str, *, default: str | None = None, check=None, secret: bool = False, error: str = ""
) -> str:
    suffix = f" [{default}]" if default else ""
    while True:
        text = (getpass.getpass if secret else input)(f"{prompt}{suffix}: ").strip()
        text = text or (default or "")
        if not text or check is None or check(text):
            return text
        say(paint(f"  {error or 'Неверное значение, попробуйте ещё раз.'}", "33"))


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Развёртывание «Гарри — пробники» на VPS")
    parser.add_argument("--host", help="IP-адрес (или имя) VPS")
    parser.add_argument("--user", default="root", help="пользователь SSH (нужен root)")
    parser.add_argument("--port", type=int, default=22, help="порт SSH")
    parser.add_argument("--domain", help="домен для HTTPS (его A-запись должна указывать на VPS)")
    parser.add_argument("--email", help="e-mail для сертификата Let's Encrypt")
    parser.add_argument("--yandex-client-id", help="ID приложения Яндекса (oauth.yandex.ru)")
    parser.add_argument("--yandex-token", help="токен Яндекса: бэкапы заработают сразу")
    parser.add_argument(
        "--yes", action="store_true", help="не задавать вопросов, взять всё из параметров"
    )
    parser.add_argument("--skip-build", action="store_true", help="не пересобирать frontend")
    parser.add_argument(
        "--restore-latest",
        action="store_true",
        help="на новой базе восстановить последнюю копию из облака",
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="показать шаги и команды, ничего не выполняя"
    )
    for flag, name, text in (
        ("--stop", "stop", "выключить приложение на сервере (данные останутся)"),
        ("--start", "start", "включить выключенное приложение"),
        ("--uninstall", "uninstall", "удалить приложение с сервера (данные сохраняются)"),
    ):
        parser.add_argument(flag, dest="action", action="store_const", const=name, help=text)
    parser.add_argument(
        "--delete-data", action="store_true", help="при удалении стереть и данные приложения"
    )
    return parser.parse_args(argv)


def collect(args: argparse.Namespace) -> Config:
    state = load_state()
    say(paint("Развёртывание «Гарри — пробники» на VPS", "1"))
    say("Нужен VPS с Ubuntu или Debian и доступ root по паролю. Пароль нигде не сохраняется.\n")

    host = args.host or ask(
        "IP-адрес VPS",
        default=state.get("host"),
        check=valid_host,
        error="Введите IP-адрес, например 203.0.113.10",
    )
    if not valid_host(host):
        raise DeployError(f"Неверный адрес VPS: {host}")

    password = os.environ.get("DEPLOY_PASSWORD", "")
    if not password and not args.dry_run:
        if args.yes:
            raise DeployError("Пароль VPS нужно передать в переменной окружения DEPLOY_PASSWORD")
        password = ask("Пароль root от VPS (ввод не виден)", secret=True)
        if not password:
            raise DeployError("Пароль не введён")

    action = args.action
    if action is None and not args.yes:
        say("\n  Что сделать?")
        say("    1 — развернуть или обновить приложение")
        say("    2 — выключить приложение (данные останутся)")
        say("    3 — включить выключенное приложение")
        say("    4 — удалить приложение с сервера")
        choice = ask(
            "Номер",
            default="1",
            check=lambda value: value in {"1", "2", "3", "4"},
            error="Введите 1, 2, 3 или 4",
        )
        action = {"1": "deploy", "2": "stop", "3": "start", "4": "uninstall"}[choice]
    action = action or "deploy"
    if action != "deploy":
        # Switching off or removing needs only the server, not the Yandex and domain questions.
        return Config(
            host=host,
            port=args.port,
            user=args.user,
            password=password,
            domain=None,
            email=None,
            yandex_client_id=None,
            yandex_token=None,
            dry_run=args.dry_run,
            yes=args.yes,
            skip_build=True,
            restore_latest=False,
            action=action,
            delete_data=args.delete_data,
        )

    client_id = args.yandex_client_id
    if client_id is None and not args.yes:
        client_id = ask(
            "ID приложения Яндекса (Enter — пропустить, подключить позже)",
            default=state.get("yandex_client_id"),
            check=valid_client_id,
            error="ID состоит из латинских букв и цифр, его видно на oauth.yandex.ru",
        )
    client_id = client_id or None
    if client_id and not valid_client_id(client_id):
        raise DeployError("ID приложения Яндекса состоит из латинских букв и цифр (8-64 символа)")

    token = args.yandex_token
    if token is None and client_id and not args.yes:
        url = f"https://oauth.yandex.ru/authorize?response_type=token&client_id={client_id}"
        say(
            "\n  Чтобы бэкапы заработали сразу, откройте ссылку, разрешите доступ\n"
            f"  и скопируйте токен:\n  {url}"
        )
        token = ask(
            "Токен Яндекса (Enter — пропустить, вставите его позже в приложении)", secret=True
        )
    token = (token or "").strip() or None

    domain = args.domain
    if domain is None and not args.yes:
        domain = ask(
            "Домен (Enter — пока только по IP)",
            default=state.get("domain"),
            check=valid_domain,
            error="Введите домен вроде school.example.com",
        )
    domain = (domain or "").strip().lower() or None
    if domain and not valid_domain(domain):
        raise DeployError(f"Неверный домен: {domain}")

    email = args.email
    if domain and email is None and not args.yes:
        email = ask(
            "E-mail для сертификата HTTPS",
            default=state.get("email"),
            check=valid_email,
            error="Введите e-mail",
        )
    email = email or None
    if domain and not email:
        raise DeployError("Для HTTPS нужен e-mail (параметр --email)")

    return Config(
        host=host,
        port=args.port,
        user=args.user,
        password=password,
        domain=domain,
        email=email,
        yandex_client_id=client_id,
        yandex_token=token,
        dry_run=args.dry_run,
        yes=args.yes,
        skip_build=args.skip_build,
        restore_latest=args.restore_latest,
        action="deploy",
        delete_data=False,
    )


# ---------------------------------------------------------------- the server


@dataclass
class Result:
    code: int
    out: str
    err: str


class Remote:
    """Runs commands on the VPS over SSH. In a dry run it only prints what it would do."""

    def __init__(self, cfg: Config):
        self.cfg, self.client = cfg, None

    def _hide(self, text: str) -> str:
        for secret in self.cfg.secrets:
            text = text.replace(secret, "***")
        return text

    def connect(self) -> str:
        if self.cfg.dry_run:
            say("      (пробный запуск: подключение пропущено)")
            return "dry-run"
        try:
            import paramiko
        except ImportError as error:  # pragma: no cover - uv installs it
            raise DeployError(
                "Не установлена библиотека paramiko. Запускайте через: uv run scripts/deploy.py"
            ) from error
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            client.connect(
                self.cfg.host,
                port=self.cfg.port,
                username=self.cfg.user,
                password=self.cfg.password,
                timeout=25,
                banner_timeout=25,
                allow_agent=False,
                look_for_keys=False,
            )
        except paramiko.AuthenticationException as error:
            raise DeployError("Сервер не принял логин или пароль") from error
        except (OSError, paramiko.SSHException) as error:
            raise DeployError(
                f"Не удалось подключиться к {self.cfg.host}:{self.cfg.port}: {error}"
            ) from error
        self.client = client
        key = client.get_transport().get_remote_server_key()
        digest = base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip("=")
        return f"SHA256:{digest}"

    def run(self, command: str, *, check: bool = True, timeout: int = 900) -> Result:
        if self.cfg.dry_run:
            say(paint(f"      $ {self._hide(command)}", "90"))
            return Result(0, "", "")
        channel = self.client.get_transport().open_session()
        channel.exec_command(f"bash -c {shlex.quote(command)}")
        channel.settimeout(timeout)
        out: list[bytes] = []
        err: list[bytes] = []
        while True:
            if channel.recv_ready():
                out.append(channel.recv(65536))
            elif channel.recv_stderr_ready():
                err.append(channel.recv_stderr(65536))
            elif channel.exit_status_ready():
                # The data of the command arrives before its exit status: take what is left.
                while channel.recv_ready():
                    out.append(channel.recv(65536))
                while channel.recv_stderr_ready():
                    err.append(channel.recv_stderr(65536))
                break
            else:
                time.sleep(0.05)
        result = Result(
            channel.recv_exit_status(),
            b"".join(out).decode("utf-8", "replace"),
            b"".join(err).decode("utf-8", "replace"),
        )
        if check and result.code != 0:
            tail = "\n".join((result.out + result.err).strip().splitlines()[-12:])
            raise DeployError(f"команда завершилась с кодом {result.code}:\n{self._hide(tail)}")
        return result

    def script(self, *lines: str, check: bool = True, timeout: int = 900) -> Result:
        return self.run("set -euo pipefail\n" + "\n".join(lines), check=check, timeout=timeout)

    def put(self, local: Path, remote: str) -> None:
        if self.cfg.dry_run:
            say(paint(f"      загрузка {local.name} -> {remote}", "90"))
            return
        sftp = self.client.open_sftp()
        try:
            sftp.put(str(local), remote)
        finally:
            sftp.close()

    def write(self, remote: str, content: str, mode: str = "644", owner: str = "root:root") -> None:
        if self.cfg.dry_run:
            say(
                paint(
                    f"      запись {remote} (права {mode}, владелец {owner}; содержимое скрыто)",
                    "90",
                )
            )
            return
        sftp = self.client.open_sftp()
        try:
            with sftp.file(remote, "w") as handle:
                handle.write(content)
        finally:
            sftp.close()
        self.run(f"chmod {mode} {shlex.quote(remote)} && chown {owner} {shlex.quote(remote)}")

    def read(self, remote: str) -> str | None:
        if self.cfg.dry_run:
            return None
        result = self.run(f"cat {shlex.quote(remote)}", check=False)
        return result.out if result.code == 0 else None

    def close(self) -> None:
        if self.client is not None:
            self.client.close()


# ---------------------------------------------------------------- what is already on the server

# One look at the server before anything is changed: what listens where, whether nginx and the
# firewall are in use, and what an earlier run of this script left behind.
# `ss` lists the busy ports. Only a deployment may install it when it is missing; switching the
# app off or removing it never installs anything.
INSTALL_SS = """export DEBIAN_FRONTEND=noninteractive
command -v ss >/dev/null 2>&1 || {
  apt-get -o DPkg::Lock::Timeout=300 update -y >/dev/null 2>&1
  apt-get -o DPkg::Lock::Timeout=300 install -y iproute2 >/dev/null 2>&1
} || true
"""
PROBE_SCRIPT = f"""echo '##SS'; ss -ltnpH 2>/dev/null || true
echo '##NGINX'; if command -v nginx >/dev/null 2>&1; then echo yes; else echo no; fi
echo '##UFW'; (ufw status 2>/dev/null || true)
echo '##STATE'; cat {STATE_PATH} 2>/dev/null || true
echo '##PID'; systemctl show {SERVICE} -p MainPID --value 2>/dev/null || true
echo '##UNIT'; if systemctl cat {SERVICE} >/dev/null 2>&1; then echo yes; else echo no; fi
"""
PROBE_MARKERS = ("SS", "NGINX", "UFW", "STATE", "PID", "UNIT")


@dataclass
class Probe:
    listeners: dict[int, tuple[str, int]]  # port -> (program, pid)
    nginx_installed: bool
    ufw_active: bool
    previous: dict  # what an earlier run of this script wrote on the server
    own_pid: int | None  # the running app of ours, so its own ports are not "taken"
    has_service: bool


def parse_listeners(text: str) -> dict[int, tuple[str, int]]:
    """Reads `ss -ltnpH`: which program listens on which port."""
    found: dict[int, tuple[str, int]] = {}
    for line in text.splitlines():
        parts = line.split()
        if len(parts) < 5 or not parts[0].startswith("LISTEN"):
            continue
        port = re.search(r":(\d+)$", parts[3])
        if not port:
            continue
        program = re.search(r'\(\("([^"]+)",pid=(\d+)', line)
        found[int(port.group(1))] = (
            (program.group(1), int(program.group(2))) if program else ("?", 0)
        )
    return found


def parse_probe(text: str) -> Probe:
    sections: dict[str, list[str]] = {}
    current = None
    for line in text.splitlines():
        if line.startswith("##") and line[2:] in PROBE_MARKERS:
            current = line[2:]
            sections[current] = []
        elif current:
            sections[current].append(line)

    def body(name: str) -> str:
        return "\n".join(sections.get(name, [])).strip()

    try:
        previous = json.loads(body("STATE") or "{}")
    except ValueError:
        previous = {}
    pid = body("PID")
    ufw = body("UFW").splitlines()
    return Probe(
        listeners=parse_listeners(body("SS")),
        nginx_installed=body("NGINX") == "yes",
        ufw_active=bool(ufw) and ufw[0].lower().startswith("status: active"),
        previous=previous if isinstance(previous, dict) else {},
        own_pid=int(pid) if pid.isdigit() and int(pid) > 0 else None,
        has_service=body("UNIT") == "yes",
    )


@dataclass
class Plan:
    app_port: int  # where the app listens, on 127.0.0.1 only
    public_port: int  # where nginx answers for it
    install_nginx: bool
    default_server: bool  # our site is the one that answers by IP on its port
    domain: str | None  # the domain that can really be used (None if it cannot)
    notes: list[str]

    @property
    def ports_to_open(self) -> list[int]:
        return [self.public_port] + ([443] if self.domain else [])


def plan_ports(probe: Probe, domain: str | None) -> Plan:
    """Picks ports so that nothing already running is disturbed."""
    listeners, previous = probe.listeners, probe.previous

    def owner(port: int) -> str | None:
        found = listeners.get(port)
        if found is None or (probe.own_pid and found[1] == probe.own_pid):
            return None  # free, or taken by our own running app
        return found[0]

    wanted = previous.get("app_port")
    candidates = ([wanted] if wanted else []) + list(
        range(DEFAULT_APP_PORT, DEFAULT_APP_PORT + 100)
    )
    app_port = next((port for port in candidates if owner(port) is None), None)
    if app_port is None:
        raise DeployError("Не нашёл свободный порт для приложения")
    notes: list[str] = []
    nginx_here, port80 = probe.nginx_installed, owner(80)

    if domain:
        if port80 is None or (port80 == "nginx" and nginx_here):
            # The domain is told apart by name, so it can share port 80 with other sites.
            return Plan(app_port, 80, not nginx_here, False, domain, notes)
        notes.append(
            f"Порт 80 занят программой «{port80}»: домен и HTTPS настроить, не мешая ей, "
            "нельзя. Приложение будет работать по IP на своём порту."
        )

    previous_public = previous.get("public_port")
    if previous_public and owner(previous_public) in (None, "nginx"):
        # A re-run keeps what it chose the first time.
        default = bool(previous.get("default_server"))
        return Plan(app_port, previous_public, not nginx_here, default, None, notes)
    if not nginx_here and port80 is None:
        return Plan(app_port, 80, True, True, None, notes)
    # Port 80 is not ours to take: it is busy, or an nginx with other sites already serves it.
    public = next(
        (port for port in range(ALT_PORTS_FROM, ALT_PORTS_FROM + 20) if port not in listeners),
        None,
    )
    if public is None:
        raise DeployError("Не нашёл свободный порт для сайта")
    why = f"занят программой «{port80}»" if port80 else "уже обслуживает nginx с другими сайтами"
    notes.append(f"Порт 80 {why}: приложение открыто на порту {public}, чужое не затронуто.")
    return Plan(app_port, public, not nginx_here, False, None, notes)


def describe(step: Step, probe: Probe, plan: Plan) -> None:
    others = {
        port: name for port, (name, pid) in sorted(probe.listeners.items()) if pid != probe.own_pid
    }
    if others:
        listed = ", ".join(f"{name} (порт {port})" for port, name in others.items())
        step.note(f"уже работает на сервере: {listed}")
        step.note("всё это затронуто не будет")
    else:
        step.note("посторонних программ на портах не найдено")
    for note in plan.notes:
        step.note(paint(note, "33"))
    step.note(f"приложение: внутренний порт {plan.app_port}, снаружи порт {plan.public_port}")
    if probe.ufw_active:
        step.note("файрвол ufw включён: добавлю правила только для нужных портов")
    else:
        step.note("файрвол ufw не включён: файрвол не трогаю")


# ---------------------------------------------------------------- steps


def check_system(remote: Remote, cfg: Config) -> None:
    info = remote.script(
        'if [ "$(id -u)" != "0" ]; then exit 3; fi',
        '. /etc/os-release; echo "${ID:-unknown}"',
        check=False,
    )
    if cfg.dry_run:
        return
    if info.code == 3:
        raise DeployError("Нужен пользователь root (или параметр --user root)")
    system = info.out.split()[0] if info.out.split() else "неизвестная система"
    if info.code != 0 or system not in {"ubuntu", "debian"}:
        raise DeployError(f"Поддерживаются Ubuntu и Debian, а на сервере: {system}")


def inspect_server(remote: Remote, cfg: Config, install_tools: bool = False) -> Probe:
    check_system(remote, cfg)
    script = (INSTALL_SS if install_tools else "") + PROBE_SCRIPT
    return parse_probe(remote.script(script).out)


def setup_vps(remote: Remote, plan: Plan) -> None:
    """Installs only what is missing. A fresh nginx is kept from starting before it is configured,
    so it can never fight another program for a port."""
    lines = [
        "export DEBIAN_FRONTEND=noninteractive",
        "apt-get -o DPkg::Lock::Timeout=300 update -y",
        "apt-get -o DPkg::Lock::Timeout=300 install -y curl ca-certificates tar",
    ]
    if plan.install_nginx:
        lines += [
            "CREATED=0",
            "if [ ! -e /usr/sbin/policy-rc.d ]; then",
            "  printf '#!/bin/sh\\nexit 101\\n' > /usr/sbin/policy-rc.d",
            "  chmod +x /usr/sbin/policy-rc.d; CREATED=1",
            "fi",
            "trap 'if [ \"$CREATED\" = 1 ]; then rm -f /usr/sbin/policy-rc.d; fi' EXIT",
            "apt-get -o DPkg::Lock::Timeout=300 install -y nginx",
            # The stock page of a fresh nginx would only compete for port 80.
            "rm -f /etc/nginx/sites-enabled/default",
            'if [ "$CREATED" = 1 ]; then rm -f /usr/sbin/policy-rc.d; CREATED=0; fi',
        ]
    if plan.domain:
        lines.append("apt-get -o DPkg::Lock::Timeout=300 install -y certbot python3-certbot-nginx")
    installer = (
        "(curl -LsSf https://astral.sh/uv/install.sh | "
        "env UV_INSTALL_DIR=/usr/local/bin INSTALLER_NO_MODIFY_PATH=1 sh)"
    )
    lines += [
        "id -u probnik >/dev/null 2>&1 || "
        f"useradd --system --create-home --home-dir {APP_DIR} --shell /usr/sbin/nologin probnik",
        f"command -v uv >/dev/null 2>&1 || {installer}",
    ]
    remote.script(*lines, timeout=1800)


def open_ports(remote: Remote, probe: Probe, plan: Plan, step: Step) -> list[str]:
    """Opens only the ports the app needs, and only if the firewall is already in use.

    The firewall is never switched on and no existing rule is touched, so the other project
    keeps working. Rules that this call really adds are returned, so they can be taken back."""
    if not probe.ufw_active:
        step.note("файрвол ufw не включён: ничего не меняю")
        return []
    added: list[str] = []
    for port in plan.ports_to_open:
        result = remote.run(f"LC_ALL=C ufw allow {port}/tcp comment {SERVICE}")
        if "Rule added" in result.out:
            added.append(f"{port}/tcp")
            step.note(f"открыт порт {port}")
        else:
            step.note(f"порт {port} уже был открыт")
    return added


def upload(remote: Remote, archive: Path) -> None:
    remote.script(
        f"systemctl stop {SERVICE} 2>/dev/null || true",
        f"mkdir -p {DATA_DIR}",
        f"rm -rf {BACKEND_DIR}/app {BACKEND_DIR}/migrations {APP_DIR}/frontend/dist",
    )
    remote.put(archive, "/tmp/probnik-release.tar.gz")
    remote.script(
        f"tar -xzf /tmp/probnik-release.tar.gz -C {APP_DIR}",
        "rm -f /tmp/probnik-release.tar.gz",
        f"chown -R probnik:probnik {APP_DIR}",
    )


def configure(remote: Remote, cfg: Config) -> str:
    """The access code is made once; later runs keep it so nobody is locked out."""
    existing = remote.read(ENV_FILE)
    api_key = (parse_env_value(existing, "API_KEY") if existing else None) or secrets.token_urlsafe(
        18
    )
    remote.write(
        ENV_FILE, render_env(api_key, cfg.yandex_client_id), mode="640", owner="root:probnik"
    )
    if cfg.yandex_token:
        remote.write(
            f"{DATA_DIR}/yandex.json",
            render_yandex(cfg.yandex_token),
            mode="600",
            owner="probnik:probnik",
        )
    return api_key


def install_dependencies(remote: Remote) -> bool:
    """Installs the packages and creates or upgrades the database; True if it is new."""
    fresh = remote.run(f"test -f {DATA_DIR}/probnik.db", check=False).code != 0
    as_app = (
        f"runuser -u probnik -- env HOME={APP_DIR} UV_PYTHON_INSTALL_DIR={APP_DIR}/.python "
        f"UV_CACHE_DIR={APP_DIR}/.cache/uv"
    )
    migrate = (
        f"runuser -u probnik -- bash -c 'set -a; . {ENV_FILE}; set +a; "
        f"cd {BACKEND_DIR} && .venv/bin/python -m app init-db'"
    )
    remote.script(
        f"cd {BACKEND_DIR}",
        f"{as_app} /usr/local/bin/uv sync --frozen --no-dev",
        migrate,
        timeout=1800,
    )
    return fresh


def wait_for_app(remote: Remote, app_port: int) -> bool:
    for _ in range(40):
        if remote.run(f"curl -fsS http://127.0.0.1:{app_port}/health", check=False).code == 0:
            return True
        time.sleep(1)
    return False


def start_service(remote: Remote, plan: Plan) -> None:
    remote.write("/etc/systemd/system/probnik.service", render_unit(plan.app_port))
    remote.script(
        "systemctl daemon-reload",
        f"systemctl enable {SERVICE}",
        f"systemctl restart {SERVICE}",
    )
    if not wait_for_app(remote, plan.app_port):
        log = remote.run(f"journalctl -u {SERVICE} -n 15 --no-pager", check=False)
        raise DeployError("Приложение не запустилось. Журнал:\n" + (log.out or log.err).strip())


def reload_nginx_lines() -> list[str]:
    return [
        "if systemctl is-active --quiet nginx; then systemctl reload nginx; "
        "else systemctl enable --now nginx; fi"
    ]


def configure_nginx(remote: Remote, plan: Plan) -> None:
    """Adds one site of our own. If nginx does not accept it, the site is taken back at once,
    so the other sites on this nginx are never left with a broken configuration."""
    site = render_nginx(plan.domain, plan.app_port, plan.public_port, plan.default_server)
    remote.write(SITE_AVAILABLE, site)
    remote.script(
        f"ln -sf {SITE_AVAILABLE} {SITE_ENABLED}",
        f"if ! nginx -t 2>/tmp/probnik-nginx.txt; then rm -f {SITE_ENABLED}; "
        "cat /tmp/probnik-nginx.txt >&2; exit 1; fi",
        *reload_nginx_lines(),
    )


def enable_https(remote: Remote, cfg: Config, plan: Plan, step: Step) -> bool:
    """HTTPS is a bonus: if the domain does not point at the VPS yet, the app still works by IP."""
    assert plan.domain and cfg.email
    try:
        resolved = socket.gethostbyname(plan.domain)
    except OSError:
        resolved = ""
    if resolved != cfg.host and not cfg.dry_run:
        where = resolved or "никуда"
        step.note(
            paint(f"Домен {plan.domain} пока указывает на {where}, а не на {cfg.host}.", "33")
        )
        step.note(paint("Создайте A-запись домена на IP сервера и запустите скрипт ещё раз.", "33"))
        return False
    result = remote.run(
        f"certbot --nginx -d {shlex.quote(plan.domain)} --non-interactive --agree-tos "
        f"-m {shlex.quote(cfg.email)} --redirect",
        check=False,
        timeout=600,
    )
    if result.code != 0:
        lines = (result.out + result.err).strip().splitlines()
        step.note(paint("Сертификат получить не удалось, приложение работает по HTTP:", "33"))
        step.note(lines[-1] if lines else "")
        return False
    return True


def api_call(remote: Remote, path: str, body: str | None = None) -> dict | None:
    """Calls the app's own API from the server; the access code is read there, never typed here."""
    data = f"-X POST -H 'Content-Type: application/json' -d {shlex.quote(body)} " if body else ""
    result = remote.run(
        f"set -a; . {ENV_FILE}; set +a; "
        f'curl -fsS {data}-H "Authorization: Bearer $API_KEY" '
        f"http://127.0.0.1:{remote.cfg.app_port}{path}",
        check=False,
    )
    if result.code != 0:
        return None
    try:
        return json.loads(result.out)
    except ValueError:
        return None


def public_url(cfg: Config, plan: Plan, https: bool) -> str:
    if plan.domain:
        return f"{'https' if https else 'http'}://{plan.domain}"
    return f"http://{cfg.host}" + ("" if plan.public_port == 80 else f":{plan.public_port}")


def verify(remote: Remote, cfg: Config, plan: Plan, https: bool) -> None:
    host_header = plan.domain or "_"
    local = f"curl -fsS -H 'Host: {host_header}' http://127.0.0.1:{plan.public_port}/health"
    if remote.run(local, check=False).code != 0:
        raise DeployError(f"Веб-сервер не отвечает на порту {plan.public_port}")
    if cfg.dry_run:
        return
    session = api_call(remote, "/api/session")
    if not session or not session.get("authenticated"):
        raise DeployError("Приложение запущено, но не принимает код доступа")
    if plan.domain and not https:
        return  # the name may not point here yet, and the address by IP is not this site
    try:
        with urllib.request.urlopen(f"{public_url(cfg, plan, https)}/health", timeout=10) as reply:
            if reply.status != 200:
                raise OSError(reply.status)
    except OSError:
        say(
            paint(
                "      ! С вашего компьютера сайт пока не открывается: проверьте файрвол у "
                f"хостинга (порт {plan.public_port}).",
                "33",
            )
        )


def offer_restore(remote: Remote, cfg: Config, fresh: bool) -> str | None:
    """On a new database with Yandex connected, the latest copy from the cloud can be restored."""
    if cfg.dry_run or not fresh or not cfg.yandex_token:
        return None
    state = api_call(remote, "/api/backups")
    if not state:
        return None
    if state.get("error"):
        return f"Копии на Яндекс Диске прочитать не удалось: {state['error']}"
    latest = state.get("latest")
    if not latest:
        return "На Яндекс Диске пока нет копий приложения."
    say(f"\n  На Яндекс Диске найдена последняя копия: {latest['name']} ({latest['created']} UTC)")
    if cfg.restore_latest:
        agree = True
    elif cfg.yes:
        agree = False
    else:
        answer = input("  Восстановить из неё данные приложения? [y/N]: ").strip().lower()
        agree = answer in {"y", "yes", "д", "да"}
    if not agree:
        return "Копия не восстановлена: это можно сделать на вкладке «Школа → Резервные копии»."
    done = api_call(remote, "/api/backups/restore", json.dumps({"name": latest["name"]}))
    if not done:
        return "Восстановить копию не удалось: попробуйте на вкладке «Школа → Резервные копии»."
    return f"Данные восстановлены из копии {latest['name']}."


def render_state(plan: Plan, probe: Probe, added: list[str], https: bool) -> str:
    """What was done on the server, so that a later stop or removal undoes exactly that."""
    state = {
        "app_port": plan.app_port,
        "public_port": plan.public_port,
        "default_server": plan.default_server,
        "domain": plan.domain,
        "https": https,
        "nginx_installed_by_us": bool(probe.previous.get("nginx_installed_by_us"))
        or plan.install_nginx,
        "ufw_added": sorted(set(probe.previous.get("ufw_added", [])) | set(added)),
        "stopped": False,
    }
    return json.dumps(state, ensure_ascii=False, indent=2)


def summary(cfg: Config, plan: Plan, api_key: str, https: bool, extra: list[str]) -> None:
    address = public_url(cfg, plan, https)
    line = "═" * 62
    say("\n" + paint(line, "32"))
    say(paint("  Готово! Приложение развёрнуто.", "1;32"))
    say(paint(line, "32"))
    say(f"  Адрес:        {address}")
    say(paint(f"  Код доступа:  {api_key}", "1;33"))
    say("")
    say(
        "  Первый вход: откройте адрес → «Сотрудник» → роль «Администратор» → вставьте код доступа."
    )
    say(f"  Если потеряете код: ssh {cfg.user}@{cfg.host} grep API_KEY {ENV_FILE}")
    if plan.public_port != 80 and not plan.domain:
        say("")
        say(
            f"  Порт {plan.public_port}: если сайт не открывается, откройте его в файрволе хостинга"
        )
    if cfg.yandex_client_id and not cfg.yandex_token:
        url = f"https://oauth.yandex.ru/authorize?response_type=token&client_id={cfg.yandex_client_id}"
        say("")
        say("  Бэкапы Яндекса: «Школа → Резервные копии» → «Открыть вход Яндекса», вставьте токен.")
        say(f"  Либо сразу: {url}")
    if not cfg.yandex_client_id:
        say("")
        say("  Бэкапы: ID приложения Яндекса не указан. Запустите скрипт ещё раз, указав его.")
    if not cfg.domain:
        say("")
        say("  Домен: когда он будет, создайте A-запись на IP сервера и запустите")
        say("         uv run scripts/deploy.py --domain ваш.домен --email ваш@email")
    say("")
    say("  Выключить: uv run scripts/deploy.py --stop   (данные останутся)")
    say("  Включить:  uv run scripts/deploy.py --start")
    say("  Удалить:   uv run scripts/deploy.py --uninstall")
    for text in extra:
        say("")
        say(f"  {text}")
    say(paint(line, "32"))


# ---------------------------------------------------------------- main


def deploy(cfg: Config) -> int:
    progress = Progress(11 + (1 if cfg.domain else 0))
    remote = Remote(cfg)
    extra: list[str] = []
    try:
        with progress.step("Собираю приложение на вашем компьютере") as step:
            if cfg.dry_run:
                step.note("(пробный запуск: сборка и упаковка пропущены)")
                archive = Path("probnik-release.tar.gz")
            else:
                build_frontend(ROOT, cfg.skip_build)
                archive = Path(tempfile.mkdtemp()) / "probnik-release.tar.gz"
                names = build_archive(ROOT, archive)
                size = archive.stat().st_size // 1024
                step.note(f"в архиве {len(names)} файлов, {size} КБ (данные и ключи не включены)")

        with progress.step(f"Подключаюсь к VPS {cfg.host}") as step:
            step.note(f"отпечаток сервера: {remote.connect()}")

        with progress.step("Смотрю, что уже работает на сервере") as step:
            probe = inspect_server(remote, cfg, install_tools=True)
            plan = plan_ports(probe, cfg.domain)
            describe(step, probe, plan)
        cfg.app_port = plan.app_port
        if cfg.domain and not plan.domain:
            progress.total -= 1  # there is no domain step when the domain cannot be used

        with progress.step("Настраиваю VPS: недостающие пакеты и пользователь"):
            setup_vps(remote, plan)

        with progress.step("Делаю развёртывание: загружаю приложение"):
            upload(remote, archive)

        with progress.step("Создаю код доступа и настройки") as step:
            api_key = configure(remote, cfg)
            step.note("код доступа создан" if not cfg.dry_run else "(код будет создан на сервере)")
            if cfg.yandex_client_id:
                step.note(
                    "ID приложения Яндекса записан"
                    + ("; токен сохранён" if cfg.yandex_token else "")
                )

        with progress.step("Устанавливаю зависимости и готовлю базу данных") as step:
            fresh = install_dependencies(remote)
            step.note("создана новая база" if fresh else "база сохранена, схема обновлена")

        with progress.step("Запускаю приложение как службу"):
            start_service(remote, plan)

        with progress.step("Подключаю сайт к веб-серверу (nginx)"):
            configure_nginx(remote, plan)

        with progress.step("Открываю порт в файрволе, если он включён") as step:
            added = open_ports(remote, probe, plan, step)

        https = False
        if plan.domain:
            with progress.step(f"Подключаю домен {plan.domain} и HTTPS") as step:
                https = enable_https(remote, cfg, plan, step)

        with progress.step("Проверяю, что всё работает"):
            verify(remote, cfg, plan, https)

        remote.write(STATE_PATH, render_state(plan, probe, added, https), owner="probnik:probnik")
        message = offer_restore(remote, cfg, fresh)
        if message:
            extra.append(message)
        if not cfg.dry_run:
            save_state(cfg)
        shown_key = "<будет создан на сервере>" if cfg.dry_run else api_key
        summary(cfg, plan, shown_key, https, extra)
        return 0
    except DeployError as error:
        say(paint(f"\nРазвёртывание остановлено: {error}", "31"))
        say("Скрипт можно запустить ещё раз: уже сделанное он не ломает.")
        return 1
    except KeyboardInterrupt:
        say(paint("\nПрервано.", "33"))
        return 130
    finally:
        remote.close()


# ---------------------------------------------------------------- stop, start, remove


def current_deployment(probe: Probe) -> dict:
    """What this script set up on the server; an older run left no record, so it is guessed."""
    if probe.previous:
        return dict(probe.previous)
    if probe.has_service:
        return {"app_port": DEFAULT_APP_PORT, "public_port": 80, "ufw_added": [], "legacy": True}
    raise DeployError(
        "На сервере не найдено развёртывание «Гарри — пробники»: нечего выключать или включать."
    )


def stop_lines(state: dict, probe: Probe) -> list[str]:
    """Takes the app off the air. Only our own service, site and firewall rules are touched."""
    lines = [
        f"systemctl stop {SERVICE} 2>/dev/null || true",
        f"systemctl disable {SERVICE} 2>/dev/null || true",
        f"rm -f {SITE_ENABLED}",
        # Other sites keep running: nginx is only reloaded, and only if its configuration is sound.
        "if command -v nginx >/dev/null 2>&1 && systemctl is-active --quiet nginx; then "
        "if nginx -t >/dev/null 2>&1; then systemctl reload nginx; fi; fi",
    ]
    if probe.ufw_active:
        for rule in state.get("ufw_added", []):
            lines.append(f"LC_ALL=C ufw delete allow {rule} >/dev/null 2>&1 || true")
    return lines


def start_lines(state: dict, probe: Probe) -> list[str]:
    lines = [f"systemctl enable --now {SERVICE}"]
    if probe.ufw_active:
        for rule in state.get("ufw_added", []):
            lines.append(f"LC_ALL=C ufw allow {rule} comment {SERVICE} >/dev/null 2>&1 || true")
    lines += [
        f"if [ -f {SITE_AVAILABLE} ]; then ln -sf {SITE_AVAILABLE} {SITE_ENABLED}; fi",
        f"if ! nginx -t 2>/tmp/probnik-nginx.txt; then rm -f {SITE_ENABLED}; "
        "cat /tmp/probnik-nginx.txt >&2; exit 1; fi",
        *reload_nginx_lines(),
    ]
    return lines


def remove_lines(state: dict, probe: Probe, delete_data: bool) -> list[str]:
    lines = stop_lines(state, probe)
    lines += [
        f"rm -f /etc/systemd/system/{SERVICE}.service",
        "systemctl daemon-reload",
        f"rm -f {SITE_AVAILABLE}",
    ]
    if state.get("https") and state.get("domain"):
        lines.append(
            "command -v certbot >/dev/null 2>&1 && certbot delete --cert-name "
            f"{shlex.quote(state['domain'])} --non-interactive >/dev/null 2>&1 || true"
        )
    if not delete_data:
        # The database and the tokens are the school's: they are moved aside, never deleted.
        lines.append(
            f"if [ -d {DATA_DIR} ]; then mkdir -p {SAVED_DATA_ROOT}; "
            f"mv {DATA_DIR} {SAVED_DATA_ROOT}/probnik-data-$(date +%Y%m%d-%H%M%S); fi"
        )
    lines += [
        f"rm -f {ENV_FILE}",
        f"rm -rf {APP_DIR}",
        "if id -u probnik >/dev/null 2>&1; then userdel probnik >/dev/null 2>&1 || true; fi",
    ]
    return lines


def confirm_removal(cfg: Config) -> None:
    if cfg.yes or cfg.dry_run:
        return
    what = "ВМЕСТЕ С ДАННЫМИ" if cfg.delete_data else f"(данные сохранятся в {SAVED_DATA_ROOT})"
    say(paint(f"\nПриложение будет удалено с сервера {what}.", "33"))
    say("Другие программы, nginx и пакеты на сервере не затрагиваются.")
    if ask("Для подтверждения введите слово УДАЛИТЬ").strip().upper() != "УДАЛИТЬ":
        raise DeployError("Удаление отменено")


def manage(cfg: Config) -> int:
    """Switches the app off or on, or takes it off the server, without disturbing anything else."""
    titles = {
        "stop": "Выключаю приложение",
        "start": "Включаю приложение",
        "uninstall": "Удаляю приложение с сервера",
    }
    progress = Progress(3)
    remote = Remote(cfg)
    try:
        with progress.step(f"Подключаюсь к VPS {cfg.host}") as step:
            step.note(f"отпечаток сервера: {remote.connect()}")

        with progress.step("Смотрю, что установлено на сервере") as step:
            probe = inspect_server(remote, cfg)
            state = dict(probe.previous) if cfg.dry_run else current_deployment(probe)
            if state.get("legacy"):
                step.note("запись о прошлом развёртывании не найдена: правила файрвола не трогаю")
            others = {name for _, (name, pid) in probe.listeners.items() if pid != probe.own_pid}
            step.note(f"других программ на портах: {len(others)}, они затронуты не будут")

        if cfg.action == "uninstall":
            confirm_removal(cfg)
        with progress.step(titles[cfg.action]):
            if cfg.action == "stop":
                remote.script(*stop_lines(state, probe))
            elif cfg.action == "start":
                remote.script(*start_lines(state, probe))
                if not wait_for_app(remote, state.get("app_port", DEFAULT_APP_PORT)):
                    raise DeployError("Приложение не запустилось: смотрите journalctl -u probnik")
            else:
                remote.script(*remove_lines(state, probe, cfg.delete_data))
            if cfg.action in {"stop", "start"} and not state.get("legacy"):
                state["stopped"] = cfg.action == "stop"
                remote.write(
                    STATE_PATH,
                    json.dumps(state, ensure_ascii=False, indent=2),
                    owner="probnik:probnik",
                )

        line = "═" * 62
        say("\n" + paint(line, "32"))
        done = {
            "stop": "Приложение выключено. Данные и настройки сохранены.",
            "start": "Приложение снова включено.",
            "uninstall": "Приложение удалено с сервера.",
        }
        say(paint(f"  {done[cfg.action]}", "1;32"))
        if cfg.action == "stop":
            say("  Включить обратно: uv run scripts/deploy.py --start")
        if cfg.action == "uninstall":
            where = "удалены" if cfg.delete_data else f"сохранены в {SAVED_DATA_ROOT}"
            say(f"  Данные {where}.")
            say("  nginx, uv и другие программы на сервере не тронуты.")
        say(paint(line, "32"))
        return 0
    except DeployError as error:
        say(paint(f"\nНе получилось: {error}", "31"))
        return 1
    except KeyboardInterrupt:
        say(paint("\nПрервано.", "33"))
        return 130
    finally:
        remote.close()


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        cfg = collect(args)
    except DeployError as error:
        say(paint(f"Ошибка: {error}", "31"))
        return 2
    except (KeyboardInterrupt, EOFError):
        say(paint("\nПрервано.", "33"))
        return 130
    return deploy(cfg) if cfg.action == "deploy" else manage(cfg)


if __name__ == "__main__":
    sys.exit(main())
