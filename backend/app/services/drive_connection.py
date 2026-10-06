import json
import os
import re
import secrets
import time
from dataclasses import dataclass
from pathlib import Path

from app.config import Settings

# The whole Drive: a folder the person made themselves is invisible to the narrower `drive.file`.
DRIVE_FULL_SCOPE = "https://www.googleapis.com/auth/drive"
FLOW_LIFETIME = 600


@dataclass(frozen=True)
class DriveConnection:
    client_id: str
    client_secret: str
    refresh_token: str
    folder_id: str
    folder_name: str


def parse_folder_id(link: str) -> str:
    """The folder id from a Drive link (`.../folders/<id>?usp=sharing`, `?id=<id>`) or a bare id."""
    link = link.strip()
    match = re.search(r"/folders/([\w-]+)", link) or re.search(r"[?&]id=([\w-]+)", link)
    if match:
        return match.group(1)
    if re.fullmatch(r"[\w-]{15,}", link):
        return link
    raise ValueError("Не удалось найти папку в ссылке. Скопируйте ссылку на папку из Google Drive")


def client_config(settings: Settings) -> dict | None:
    """The OAuth client: `client_secret.json` next to the app, or GDRIVE_CLIENT_ID / _SECRET."""
    path = Path(settings.gdrive_client_file)
    if path.is_file():
        config = json.loads(path.read_text(encoding="utf-8"))
        for kind in ("web", "installed"):
            if kind in config:
                # Google's file has these; a trimmed copy should still work.
                config[kind].setdefault("auth_uri", "https://accounts.google.com/o/oauth2/auth")
                config[kind].setdefault("token_uri", "https://oauth2.googleapis.com/token")
                return config
    if settings.gdrive_client_id and settings.gdrive_client_secret:
        return {
            "web": {
                "client_id": settings.gdrive_client_id,
                "client_secret": settings.gdrive_client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        }
    return None


def _client(config: dict) -> dict:
    return config.get("web") or config.get("installed") or {}


def client_credentials(settings: Settings) -> tuple[str, str] | None:
    config = client_config(settings)
    if config is None:
        return None
    client = _client(config)
    return client["client_id"], client["client_secret"]


def load(settings: Settings) -> DriveConnection | None:
    path = Path(settings.gdrive_file)
    config = client_config(settings)
    if config is None or not path.is_file():
        return None
    saved = json.loads(path.read_text(encoding="utf-8"))
    client = _client(config)
    return DriveConnection(
        client["client_id"],
        client["client_secret"],
        saved["refresh_token"],
        saved["folder_id"],
        saved.get("folder_name", ""),
    )


def save(settings: Settings, refresh_token: str, folder_id: str, folder_name: str) -> None:
    path = Path(settings.gdrive_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {"refresh_token": refresh_token, "folder_id": folder_id, "folder_name": folder_name},
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


def forget(settings: Settings) -> None:
    Path(settings.gdrive_file).unlink(missing_ok=True)


class Flows:
    """Sign-in attempts in progress. Each one is single-use and expires, so the unauthenticated
    callback can only finish a sign-in that an administrator started."""

    def __init__(self):
        self._items: dict[str, tuple[object, str, float]] = {}

    def start(self, flow, folder_id: str) -> str:
        now = time.monotonic()
        self._items = {k: v for k, v in self._items.items() if now - v[2] < FLOW_LIFETIME}
        state = secrets.token_urlsafe(24)
        self._items[state] = (flow, folder_id, now)
        return state

    def take(self, state: str):
        item = self._items.pop(state, None)
        if item is None or time.monotonic() - item[2] > FLOW_LIFETIME:
            raise ValueError("Вход устарел или уже использован. Начните подключение заново")
        return item[0], item[1]


def begin(settings: Settings, flows: Flows, redirect_uri: str, folder_link: str) -> str:
    """Builds the Google sign-in address for the chosen folder."""
    folder_id = parse_folder_id(folder_link)
    config = client_config(settings)
    if config is None:
        raise ValueError("Не найден client_secret.json. Положите его в папку приложения")
    try:
        from google_auth_oauthlib.flow import Flow
    except ImportError as error:
        raise ValueError("Не установлена google-auth-oauthlib. Выполните: uv sync") from error
    flow = Flow.from_client_config(config, [DRIVE_FULL_SCOPE], redirect_uri=redirect_uri)
    state = flows.start(flow, folder_id)
    url, _ = flow.authorization_url(access_type="offline", prompt="consent", state=state)
    return url


def finish(flows: Flows, state: str, code: str, redirect_uri: str) -> tuple[str, str]:
    """Exchanges the code from Google for a refresh token; returns it with the folder id."""
    flow, folder_id = flows.take(state)
    if redirect_uri.startswith(("http://localhost", "http://127.0.0.1")):
        # oauthlib insists on https; a local address is the one place plain http is fine.
        os.environ.setdefault("OAUTHLIB_INSECURE_TRANSPORT", "1")
    flow.fetch_token(code=code)
    token = flow.credentials.refresh_token
    if not token:
        raise ValueError("Google не выдал refresh token. Отзовите доступ приложения и повторите")
    return token, folder_id
