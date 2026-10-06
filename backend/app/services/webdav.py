import json
import xml.etree.ElementTree as ET
from datetime import UTC
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import quote, unquote, urlparse

from app.config import Settings
from app.services.cloud_backup import BackupObject
from app.time import utcnow

YANDEX_URL = "https://webdav.yandex.ru"
DAV = "{DAV:}"


class WebDavStore:
    """Backups in a folder of any WebDAV cloud: Yandex Disk, Nextcloud, Mail.ru Cloud…

    The person signs in with a login and an application password made for this purpose, so no
    developer console or OAuth client is needed.
    """

    def __init__(self, url: str, login: str, password: str, folder: str, session=None):
        self.url = url.rstrip("/")
        self.login, self.password = login, password
        self.folder = folder.strip("/") or "Probnik backups"
        self.bucket = f"{urlparse(self.url).hostname} · {self.folder}"
        self._session = session

    def _http(self):
        if self._session is None:
            import requests

            self._session = requests.Session()
            self._session.auth = (self.login, self.password)
        return self._session

    def _folder_url(self) -> str:
        return f"{self.url}/{quote(self.folder)}"

    def _call(self, method: str, url: str, ok: tuple[int, ...], **options):
        response = self._http().request(method, url, timeout=120, **options)
        if response.status_code in (401, 403):
            raise RuntimeError("неверный логин или пароль приложения")
        if response.status_code not in ok:
            # The server's own words (Yandex explains refusals in the body) say more than a code.
            detail = " ".join(str(getattr(response, "text", "") or "").split())[:200]
            step = {"PROPFIND": "чтение папки", "MKCOL": "создание папки", "PUT": "загрузка файла"}
            raise RuntimeError(
                f"облако ответило ошибкой {response.status_code} "
                f"({step.get(method, method)}){': ' + detail if detail else ''}"
            )
        return response

    def _ensure_folder(self) -> None:
        path = ""
        for part in self.folder.split("/"):
            path += f"/{quote(part)}"
            # 405 is «already exists» for WebDAV servers.
            self._call("MKCOL", self.url + path, ok=(201, 405))

    def check_access(self) -> None:
        """Proves the login works and that the folder can be used (it is created if missing)."""
        self._ensure_folder()
        self.list()

    def list(self) -> list[BackupObject]:
        response = self._call(
            "PROPFIND", f"{self._folder_url()}/", ok=(207, 404), headers={"Depth": "1"}
        )
        if response.status_code == 404:
            return []
        items = []
        for entry in ET.fromstring(response.content).iter(f"{DAV}response"):
            href = entry.findtext(f"{DAV}href") or ""
            if href.endswith("/"):
                continue
            properties = entry.find(f"{DAV}propstat/{DAV}prop")
            size = properties.findtext(f"{DAV}getcontentlength") if properties is not None else None
            modified = (
                properties.findtext(f"{DAV}getlastmodified") if properties is not None else None
            )
            created = (
                parsedate_to_datetime(modified).astimezone(UTC).replace(tzinfo=None)
                if modified
                else utcnow()
            )
            items.append(BackupObject(unquote(href.rsplit("/", 1)[-1]), int(size or 0), created))
        return sorted(items, key=lambda item: item.created, reverse=True)

    def download(self, name: str) -> bytes:
        return self._call("GET", f"{self._folder_url()}/{quote(name)}", ok=(200,)).content

    def upload(self, path: Path, name: str) -> BackupObject:
        self._ensure_folder()
        data = path.read_bytes()
        self._call("PUT", f"{self._folder_url()}/{quote(name)}", ok=(200, 201, 204), data=data)
        return BackupObject(name, len(data), utcnow())


def load(settings: Settings) -> WebDavStore | None:
    path = Path(settings.webdav_file)
    if not path.is_file():
        return None
    saved = json.loads(path.read_text(encoding="utf-8"))
    return WebDavStore(saved["url"], saved["login"], saved["password"], saved["folder"])


def save(settings: Settings, store: WebDavStore) -> None:
    path = Path(settings.webdav_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "url": store.url,
                "login": store.login,
                "password": store.password,
                "folder": store.folder,
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


def forget(settings: Settings) -> None:
    Path(settings.webdav_file).unlink(missing_ok=True)
