import json
from pathlib import Path

from app.services.cloud_backup import DRIVE_SCOPE


def authorize(client_secret: Path, port: int = 0) -> str:
    """Opens the browser once and returns the environment variables for Google Drive backups."""
    try:
        from google_auth_oauthlib.flow import InstalledAppFlow
    except ImportError as error:
        raise SystemExit("Не установлена google-auth-oauthlib. Выполните: uv sync") from error
    if not client_secret.is_file():
        raise SystemExit(
            f"Файл не найден: {client_secret}. Укажите полный путь к JSON, скачанному из Google "
            "Cloud Console (обычно «Загрузки», имя вида "
            "client_secret_...apps.googleusercontent.com.json)."
        )
    config = json.loads(client_secret.read_text(encoding="utf-8"))
    client = config.get("installed") or config.get("web") or {}
    flow = InstalledAppFlow.from_client_secrets_file(str(client_secret), [DRIVE_SCOPE])
    # offline + consent make Google issue a refresh token even if the app was authorized before.
    credentials = flow.run_local_server(port=port, access_type="offline", prompt="consent")
    if not credentials.refresh_token:
        raise SystemExit("Google не выдал refresh token. Отзовите доступ приложения и повторите.")
    return "\n".join(
        [
            "Добавьте эти переменные окружения и перезапустите приложение:",
            f"GDRIVE_CLIENT_ID={client.get('client_id', '')}",
            f"GDRIVE_CLIENT_SECRET={client.get('client_secret', '')}",
            f"GDRIVE_REFRESH_TOKEN={credentials.refresh_token}",
        ]
    )
