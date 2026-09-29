"""Local launcher and PyInstaller entry point. No separate desktop UI."""

import os
import secrets
import socket
import threading
import time
import urllib.request
import webbrowser

import uvicorn
from alembic import command
from alembic.config import Config

from app.config import ROOT
from app.main import create_app


def main():
    os.environ.setdefault("API_KEY", secrets.token_urlsafe(32))
    command.upgrade(Config(str(ROOT / "alembic.ini")), "head")
    # Hold the bound socket until Uvicorn takes over; no free-port race.
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", int(os.getenv("PROBNIK_PORT", "0"))))
    port = sock.getsockname()[1]
    url = f"http://127.0.0.1:{port}"

    def open_browser():
        for _ in range(100):
            try:
                with urllib.request.urlopen(url + "/health", timeout=1):
                    if os.getenv("PROBNIK_NO_BROWSER") != "1":
                        webbrowser.open(url + "/#local-key=" + os.environ["API_KEY"])
                    return
            except OSError:
                time.sleep(0.1)

    threading.Thread(target=open_browser, daemon=True).start()
    print(f"Пробник: {url}. Для остановки закройте это окно.", flush=True)
    print("Ключ для входа сотрудников: " + os.environ["API_KEY"], flush=True)
    try:
        uvicorn.Server(uvicorn.Config(create_app(), host="127.0.0.1", port=port)).run(
            sockets=[sock]
        )
    finally:
        sock.close()


if __name__ == "__main__":
    main()
