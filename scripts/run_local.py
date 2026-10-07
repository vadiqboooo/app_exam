# /// script
# requires-python = ">=3.10"
# dependencies = ["nodejs-wheel-binaries>=22"]
# ///
"""Запускает «Гарри — пробники» на этом компьютере. Ничего ставить заранее не нужно.

    uv run scripts/run_local.py        (или двойной щелчок по start.cmd на Windows)

Скрипт соберёт интерфейс, поставит библиотеки сервера, подготовит базу, запустит приложение и
откроет его в браузере. Данные лежат в папке пользователя (не в проекте и не в OneDrive), код
доступа создаётся один раз и запоминается. Если указать ID приложения Яндекса (и токен), доступ к
бэкапам на Яндекс Диске есть сразу, а на новой базе можно восстановить последнюю копию.
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import deploy  # noqa: E402  (shared output helpers and the frontend build)

ROOT = deploy.ROOT
BACKEND = ROOT / "backend"
FIRST_PORT = 8000
PORT_TRIES = 11


def default_data_dir() -> Path:
    """A folder of the user's own, away from the project and from cloud-synced folders."""
    if os.name == "nt":
        base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share")
    return base / "Probnik"


def load_state(data_dir: Path) -> dict:
    try:
        return json.loads((data_dir / "local.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_state(data_dir: Path, state: dict) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    text = json.dumps(state, ensure_ascii=False, indent=2)
    (data_dir / "local.json").write_text(text, encoding="utf-8")


def venv_python() -> Path:
    if os.name == "nt":
        return BACKEND / ".venv" / "Scripts" / "python.exe"
    return BACKEND / ".venv" / "bin" / "python"


def needs_build(root: Path) -> bool:
    """The interface is rebuilt when it is missing or older than its sources."""
    frontend = root / "frontend"
    index = frontend / "dist" / "index.html"
    if not index.is_file():
        return True
    built = index.stat().st_mtime
    sources = [frontend / name for name in ("index.html", "package.json", "package-lock.json")]
    sources += list((frontend / "src").rglob("*"))
    return any(path.is_file() and path.stat().st_mtime > built for path in sources)


def free_port(first: int = FIRST_PORT, tries: int = PORT_TRIES) -> int:
    for port in range(first, first + tries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            if probe.connect_ex(("127.0.0.1", port)) != 0:
                return port
    raise deploy.DeployError(
        f"Заняты порты {first}-{first + tries - 1}. Закройте другую копию приложения."
    )


def server_env(data_dir: Path, state: dict) -> dict[str, str]:
    env = {key: value for key, value in os.environ.items() if key != "VIRTUAL_ENV"}
    env.update(
        API_KEY=state["api_key"],
        DATABASE_URL=f"sqlite:///{(data_dir / 'probnik.db').as_posix()}",
        YANDEX_FILE=str(data_dir / "yandex.json"),
        FOLDER_FILE=str(data_dir / "folder.json"),
        GDRIVE_FILE=str(data_dir / "drive.json"),
        WEBDAV_FILE=str(data_dir / "webdav.json"),
    )
    if state.get("yandex_client_id"):
        env["YANDEX_CLIENT_ID"] = state["yandex_client_id"]
    return env


def api(base: str, key: str, path: str, body: dict | None = None) -> dict | None:
    request = urllib.request.Request(
        base + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST" if body is not None else "GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.loads(response.read().decode("utf-8"))
    except (OSError, ValueError):
        return None


def run(command: list[str], *, cwd: Path, env: dict[str, str], timeout: int = 1800) -> None:
    result = subprocess.run(
        command, cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout
    )
    if result.returncode != 0:
        tail = "\n".join((result.stdout + result.stderr).strip().splitlines()[-12:])
        raise deploy.DeployError(f"`{' '.join(command[:3])}` завершилась с ошибкой:\n{tail}")


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Запуск «Гарри — пробники» на этом компьютере")
    parser.add_argument("--data-dir", type=Path, help="папка данных (по умолчанию в профиле)")
    parser.add_argument("--port", type=int, default=FIRST_PORT, help="порт приложения")
    parser.add_argument("--yandex-client-id", help="ID приложения Яндекса (oauth.yandex.ru)")
    parser.add_argument("--yandex-token", help="токен Яндекса: бэкапы заработают сразу")
    parser.add_argument(
        "--restore-latest", action="store_true", help="на новой базе восстановить последнюю копию"
    )
    parser.add_argument("--yes", action="store_true", help="не задавать вопросов")
    parser.add_argument("--no-browser", action="store_true", help="не открывать браузер")
    parser.add_argument("--skip-build", action="store_true", help="не пересобирать интерфейс")
    parser.add_argument(
        "--smoke", action="store_true", help="запустить, проверить и сразу остановить"
    )
    return parser.parse_args(argv)


def ask_first_time(args: argparse.Namespace, state: dict) -> tuple[dict, str | None]:
    """The Yandex app id and token are asked once; later runs remember them."""
    client_id = args.yandex_client_id or state.get("yandex_client_id")
    token = args.yandex_token
    first_run = "asked" not in state
    if first_run and not args.yes and args.yandex_client_id is None:
        deploy.say("Бэкапы на Яндекс Диске (можно пропустить и подключить позже в приложении).")
        client_id = (
            deploy.ask(
                "ID приложения Яндекса (Enter — пропустить)",
                check=deploy.valid_client_id,
                error="ID состоит из латинских букв и цифр, его видно на oauth.yandex.ru",
            )
            or None
        )
        if client_id and token is None:
            url = f"https://oauth.yandex.ru/authorize?response_type=token&client_id={client_id}"
            deploy.say(f"\n  Откройте ссылку, разрешите доступ и скопируйте токен:\n  {url}")
            token = deploy.ask("Токен Яндекса (Enter — пропустить)", secret=True)
    if client_id and not deploy.valid_client_id(client_id):
        raise deploy.DeployError(
            "ID приложения Яндекса состоит из латинских букв и цифр (8-64 символа)"
        )
    state = {**state, "yandex_client_id": client_id, "asked": True}
    return state, (token or "").strip() or None


def offer_restore(base: str, key: str, args: argparse.Namespace) -> str | None:
    backups = api(base, key, "/api/backups")
    if not backups:
        return None
    if backups.get("error"):
        return f"Копии на Яндекс Диске прочитать не удалось: {backups['error']}"
    latest = backups.get("latest")
    if not latest:
        return "На Яндекс Диске пока нет копий приложения."
    deploy.say(f"\n  Найдена последняя копия на диске: {latest['name']} ({latest['created']} UTC)")
    if args.restore_latest:
        agree = True
    elif args.yes:
        agree = False
    else:
        answer = input("  Восстановить из неё данные? [y/N]: ").strip().lower()
        agree = answer in {"y", "yes", "д", "да"}
    if not agree:
        return "Копия не восстановлена: это можно сделать в «Школа → Резервные копии»."
    if not api(base, key, "/api/backups/restore", {"name": latest["name"]}):
        return "Восстановить копию не удалось: попробуйте в «Школа → Резервные копии»."
    return f"Данные восстановлены из копии {latest['name']}."


def wait_for_server(process: subprocess.Popen, base: str, log: Path) -> None:
    for _ in range(60):
        if process.poll() is not None:
            break
        try:
            with urllib.request.urlopen(base + "/health", timeout=2) as response:
                if response.status == 200:
                    return
        except OSError:
            time.sleep(1)
    text = log.read_text(encoding="utf-8", errors="replace")
    tail = "\n".join(text.strip().splitlines()[-12:])
    raise deploy.DeployError(f"Приложение не запустилось. Журнал {log}:\n{tail}")


def summary(base: str, state: dict, has_token: bool, data_dir: Path, message: str | None) -> None:
    say, paint = deploy.say, deploy.paint
    line = "═" * 62
    say("\n" + paint(line, "32"))
    say(paint("  Готово! Приложение запущено.", "1;32"))
    say(paint(line, "32"))
    say(f"  Адрес:        {base}")
    say(paint(f"  Код доступа:  {state['api_key']}", "1;33"))
    say("")
    say("  Вход: «Сотрудник» → роль «Администратор» → вставьте код доступа.")
    connected = has_token or (data_dir / "yandex.json").exists()
    if state.get("yandex_client_id") and not connected:
        say("  Бэкапы: «Школа → Резервные копии» → «Открыть вход Яндекса» → вставьте токен.")
    if not state.get("yandex_client_id"):
        say("  Бэкапы: ID приложения Яндекса не указан (--yandex-client-id), подключите позже.")
    if message:
        say(f"\n  {message}")
    say(paint(line, "32"))


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    say, paint = deploy.say, deploy.paint
    data_dir = (args.data_dir or default_data_dir()).resolve()
    process: subprocess.Popen | None = None
    try:
        say(paint("Запуск «Гарри — пробники» на этом компьютере", "1"))
        say(f"Данные хранятся в: {data_dir}\n")
        data_dir.mkdir(parents=True, exist_ok=True)
        state, token = ask_first_time(args, load_state(data_dir))
        state.setdefault("api_key", secrets.token_urlsafe(18))
        save_state(data_dir, state)
        if token:
            (data_dir / "yandex.json").write_text(deploy.render_yandex(token), encoding="utf-8")

        progress = deploy.Progress(5)
        with progress.step("Готовлю интерфейс") as step:
            if args.skip_build or not needs_build(ROOT):
                step.note("интерфейс уже собран и актуален")
            else:
                deploy.build_frontend(ROOT, skip=False)

        env = server_env(data_dir, state)
        uv = shutil.which("uv")
        if uv is None:
            raise deploy.DeployError("Не найден uv. Запускайте через start.cmd или uv run")
        with progress.step("Ставлю библиотеки сервера"):
            run([uv, "sync", "--locked"], cwd=BACKEND, env=env)

        fresh = not (data_dir / "probnik.db").exists()
        with progress.step("Готовлю базу данных") as step:
            run([str(venv_python()), "-m", "app", "init-db"], cwd=BACKEND, env=env)
            step.note("создана новая база" if fresh else "база сохранена, схема обновлена")

        base = f"http://127.0.0.1:{free_port(args.port)}"
        port = base.rsplit(":", 1)[1]
        log = data_dir / "server.log"
        with progress.step(f"Запускаю приложение на порту {port}"):
            command = [str(venv_python()), "-m", "uvicorn", "app.main:create_app", "--factory"]
            command += ["--host", "127.0.0.1", "--port", port]
            with log.open("w", encoding="utf-8") as sink:
                process = subprocess.Popen(
                    command, cwd=BACKEND, env=env, stdout=sink, stderr=subprocess.STDOUT
                )
            wait_for_server(process, base, log)

        with progress.step("Проверяю, что всё работает"):
            session = api(base, state["api_key"], "/api/session")
            if not session or not session.get("authenticated"):
                raise deploy.DeployError("Приложение запущено, но не принимает код доступа")

        restorable = fresh and bool(token)
        message = offer_restore(base, state["api_key"], args) if restorable else None
        summary(base, state, bool(token), data_dir, message)
        if args.smoke:
            return 0
        if not args.no_browser:
            webbrowser.open(base)
        say("\nПриложение работает. Чтобы остановить, закройте окно или нажмите Ctrl+C.")
        process.wait()
        return process.returncode or 0
    except deploy.DeployError as error:
        say(paint(f"\nНе получилось: {error}", "31"))
        return 1
    except KeyboardInterrupt:
        say(paint("\nОстановлено.", "33"))
        return 0
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()


if __name__ == "__main__":
    sys.exit(main())
