import json
from datetime import UTC, datetime
from pathlib import Path

from app.config import Settings
from app.services.cloud_backup import BackupObject
from app.time import utcnow

API = "https://cloud-api.yandex.net/v1/disk"
APP_ROOT = "app:/"
FIELDS = "_embedded.items.name,_embedded.items.type,_embedded.items.size,_embedded.items.created"


class YandexDiskStore:
    """Backups on Yandex Disk through its REST API (free for every account).

    The token comes from a Yandex OAuth app. With the «app folder» permission the files live in
    `Приложения/<app>/` and the token cannot see anything else; with full access the app uses
    its own folder on the disk instead.
    """

    def __init__(self, token: str, folder: str = "Probnik backups", root=None, session=None):
        self.token, self.folder = token, folder.strip("/") or "Probnik backups"
        self.root = root  # `app:/` or `disk:/<folder>`; found on first use when unknown
        self._session = session

    @property
    def bucket(self) -> str:
        return "Яндекс Диск · " + ("папка приложения" if self.root == APP_ROOT else self.folder)

    def _http(self):
        if self._session is None:
            import requests

            self._session = requests.Session()
        return self._session

    def _call(self, method: str, url: str, ok: tuple[int, ...], **options):
        headers = {"Authorization": f"OAuth {self.token}"} if url.startswith(API) else {}
        response = self._http().request(method, url, headers=headers, timeout=300, **options)
        if response.status_code == 401:
            raise RuntimeError("Яндекс не принял токен: он неверный или истёк")
        if response.status_code not in ok:
            try:
                reason = response.json().get("description") or response.json().get("message")
            except Exception:
                reason = ""
            raise RuntimeError(
                f"Яндекс Диск ответил ошибкой {response.status_code}"
                + (f": {reason}" if reason else "")
            )
        return response

    def _path(self, name: str = "") -> str:
        return f"{self.root}{name}" if self.root == APP_ROOT else f"{self.root}/{name}".rstrip("/")

    def _find_root(self) -> str:
        if self.root is None:
            # The app-folder permission opens `app:/`; a full-access token is refused there.
            probe = self._http().request(
                "GET",
                f"{API}/resources",
                params={"path": APP_ROOT, "limit": 1},
                headers={"Authorization": f"OAuth {self.token}"},
                timeout=60,
            )
            if probe.status_code == 401:
                raise RuntimeError("Яндекс не принял токен: он неверный или истёк")
            self.root = APP_ROOT if probe.status_code == 200 else f"disk:/{self.folder}"
        return self.root

    def _ensure_folder(self) -> None:
        if self._find_root() != APP_ROOT:
            # 409 means the folder already exists.
            self._call("PUT", f"{API}/resources", ok=(201, 409), params={"path": self.root})

    def check_access(self) -> None:
        """Proves the token works and that the folder can be used (it is created if missing)."""
        self._ensure_folder()
        self.list()

    def list(self) -> list[BackupObject]:
        self._find_root()
        response = self._call(
            "GET",
            f"{API}/resources",
            ok=(200, 404),
            params={"path": self._path(), "limit": 100, "sort": "-created", "fields": FIELDS},
        )
        if response.status_code == 404:
            return []
        items = []
        for item in response.json().get("_embedded", {}).get("items", []):
            if item.get("type") != "file":
                continue
            created = datetime.fromisoformat(item["created"]).astimezone(UTC).replace(tzinfo=None)
            items.append(BackupObject(item["name"], int(item.get("size", 0)), created))
        return sorted(items, key=lambda item: item.created, reverse=True)

    def download(self, name: str) -> bytes:
        self._find_root()
        link = self._call(
            "GET", f"{API}/resources/download", ok=(200,), params={"path": self._path(name)}
        ).json()["href"]
        return self._call("GET", link, ok=(200,)).content

    def upload(self, path: Path, name: str) -> BackupObject:
        self._ensure_folder()
        data = path.read_bytes()
        target = self._call(
            "GET",
            f"{API}/resources/upload",
            ok=(200,),
            params={"path": self._path(name), "overwrite": "true"},
        ).json()["href"]
        self._call("PUT", target, ok=(201, 202), data=data)
        return BackupObject(name, len(data), utcnow())


def load(settings: Settings) -> YandexDiskStore | None:
    path = Path(settings.yandex_file)
    if not path.is_file():
        return None
    saved = json.loads(path.read_text(encoding="utf-8"))
    return YandexDiskStore(
        saved["token"], saved.get("folder", "Probnik backups"), saved.get("root")
    )


def save(settings: Settings, store: YandexDiskStore) -> None:
    path = Path(settings.yandex_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {"token": store.token, "folder": store.folder, "root": store.root}, ensure_ascii=False
        ),
        encoding="utf-8",
    )


def forget(settings: Settings) -> None:
    Path(settings.yandex_file).unlink(missing_ok=True)
