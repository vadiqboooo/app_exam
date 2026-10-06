import gzip
import json
import shutil
import tempfile
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Protocol

from sqlalchemy.engine import Engine

from app.config import Settings
from app.services import drive_connection
from app.services.backup import backup_database
from app.time import utcnow

# A backup older than this is reported as stale before an import.
STALE_AFTER = timedelta(hours=24)
KEEP_LISTED = 10


@dataclass(frozen=True)
class BackupObject:
    name: str
    size: int
    created: datetime  # naive UTC, like every timestamp in the database


class BackupStore(Protocol):
    bucket: str

    def list(self) -> list[BackupObject]: ...

    def upload(self, path: Path, name: str) -> BackupObject: ...

    def download(self, name: str) -> bytes: ...


def is_backup(name: str) -> bool:
    """A copy made by this app (as opposed to a file the school put into the same folder)."""
    return name.startswith("probnik-") and name.endswith(".db.gz")


def is_legacy(name: str) -> bool:
    """A database file of the previous version of the program, which the import can read."""
    lowered = name.lower()
    return lowered.endswith((".db", ".sqlite", ".sqlite3", ".db.gz")) and not is_backup(name)


def _naive_utc(value: datetime) -> datetime:
    return value.astimezone(UTC).replace(tzinfo=None) if value.tzinfo else value


class GcsStore:
    """Backups as objects of a Google Cloud Storage bucket (service account access)."""

    def __init__(self, bucket: str, prefix: str, credentials: str):
        self.bucket, self.prefix, self.credentials = bucket, prefix, credentials
        self._client = None

    def _connect(self):
        if self._client is None:
            try:
                from google.cloud import storage
            except ImportError as error:
                raise ValueError(
                    "Не установлена библиотека google-cloud-storage. Выполните: uv sync"
                ) from error
            self._client = (
                storage.Client.from_service_account_json(self.credentials)
                if self.credentials
                else storage.Client()
            )
        return self._client

    def list(self) -> list[BackupObject]:
        blobs = self._connect().list_blobs(self.bucket, prefix=self.prefix)
        return sorted(
            (
                BackupObject(
                    blob.name.removeprefix(self.prefix),
                    blob.size or 0,
                    _naive_utc(blob.time_created),
                )
                for blob in blobs
                if blob.name != self.prefix
            ),
            key=lambda item: item.created,
            reverse=True,
        )

    def upload(self, path: Path, name: str) -> BackupObject:
        blob = self._connect().bucket(self.bucket).blob(self.prefix + name)
        blob.upload_from_filename(str(path), content_type="application/gzip")
        blob.reload()
        return BackupObject(name, blob.size or 0, _naive_utc(blob.time_created))

    def download(self, name: str) -> bytes:
        return self._connect().bucket(self.bucket).blob(self.prefix + name).download_as_bytes()


DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"
FOLDER_MIME = "application/vnd.google-apps.folder"


class DriveStore:
    """Backups in a folder of someone's Google Drive.

    The `drive.file` scope only sees files this app created, so the app makes its own folder
    on the first upload instead of asking for an existing folder id.
    """

    API = "https://www.googleapis.com/drive/v3/files"
    UPLOAD = "https://www.googleapis.com/upload/drive/v3/files"

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        refresh_token: str,
        folder: str,
        session=None,
        folder_id: str | None = None,
        scope: str = DRIVE_SCOPE,
    ):
        # With a folder id the person's own folder is used as it is; without one the app makes
        # (and finds again by name) a folder of its own.
        self.folder_id, self.scope = folder_id, scope
        self.client_id, self.client_secret, self.refresh_token = (
            client_id,
            client_secret,
            refresh_token,
        )
        self.folder = folder
        self.bucket = f"Google Drive · {folder}"
        self._session = session

    def _http(self):
        if self._session is None:
            try:
                from google.auth.transport.requests import AuthorizedSession
                from google.oauth2.credentials import Credentials
            except ImportError as error:
                raise ValueError(
                    "Не установлена библиотека google-auth. Выполните: uv sync"
                ) from error
            self._session = AuthorizedSession(
                Credentials(
                    None,
                    refresh_token=self.refresh_token,
                    token_uri="https://oauth2.googleapis.com/token",
                    client_id=self.client_id,
                    client_secret=self.client_secret,
                    scopes=[self.scope],
                )
            )
        return self._session

    def _fetch(self, method: str, url: str, **options):
        response = self._http().request(method, url, **options)
        if response.status_code >= 400:
            try:
                reason = response.json()["error"]["message"]
            except Exception:
                reason = response.text[:200]
            raise RuntimeError(f"Google Drive ({response.status_code}): {reason}")
        return response

    def _call(self, method: str, url: str, **options) -> dict:
        return self._fetch(method, url, **options).json()

    def folder_name(self) -> str:
        return self._call("GET", f"{self.API}/{self.folder_id}", params={"fields": "name"})["name"]

    def _folder_id(self, create: bool) -> str | None:
        if self.folder_id:
            return self.folder_id
        name = self.folder.replace("\\", "\\\\").replace("'", "\\'")
        found = self._call(
            "GET",
            self.API,
            params={
                "q": f"mimeType='{FOLDER_MIME}' and name='{name}' and trashed=false",
                "fields": "files(id)",
                "pageSize": 1,
            },
        )["files"]
        if found:
            return found[0]["id"]
        if not create:
            return None
        return self._call("POST", self.API, json={"name": self.folder, "mimeType": FOLDER_MIME})[
            "id"
        ]

    @staticmethod
    def _object(item: dict) -> BackupObject:
        created = datetime.fromisoformat(item["createdTime"])
        return BackupObject(item["name"], int(item.get("size", 0)), _naive_utc(created))

    def list(self) -> list[BackupObject]:
        folder = self._folder_id(create=False)
        if folder is None:
            return []
        files = self._call(
            "GET",
            self.API,
            params={
                "q": f"'{folder}' in parents and trashed=false",
                "fields": "files(name,size,createdTime)",
                "orderBy": "createdTime desc",
                "pageSize": 100,
            },
        )["files"]
        return [self._object(item) for item in files]

    def download(self, name: str) -> bytes:
        folder = self._folder_id(create=False)
        escaped = name.replace("\\", "\\\\").replace("'", "\\'")
        found = self._call(
            "GET",
            self.API,
            params={
                "q": f"'{folder}' in parents and name='{escaped}' and trashed=false",
                "fields": "files(id)",
                "pageSize": 1,
            },
        )["files"]
        if not found:
            raise RuntimeError("файла нет в папке на диске")
        return self._fetch("GET", f"{self.API}/{found[0]['id']}", params={"alt": "media"}).content

    def upload(self, path: Path, name: str) -> BackupObject:
        folder = self._folder_id(create=True)
        boundary = "probnik-backup-boundary"
        meta = json.dumps({"name": name, "parents": [folder]})
        body = (
            (
                f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{meta}\r\n"
                f"--{boundary}\r\nContent-Type: application/gzip\r\n\r\n"
            ).encode()
            + path.read_bytes()
            + f"\r\n--{boundary}--".encode()
        )
        item = self._call(
            "POST",
            self.UPLOAD,
            params={"uploadType": "multipart", "fields": "name,size,createdTime"},
            data=body,
            headers={"Content-Type": f"multipart/related; boundary={boundary}"},
        )
        return self._object(item)


def make_store(settings: Settings) -> BackupStore | None:
    # imported here: these modules themselves need BackupObject
    from app.services import local_folder, webdav, yandex_disk

    disk = yandex_disk.load(settings)
    if disk:
        return disk

    synced = local_folder.load(settings)
    if synced:
        return synced

    cloud = webdav.load(settings)
    if cloud:
        return cloud
    connection = drive_connection.load(settings)
    if connection:
        return DriveStore(
            connection.client_id,
            connection.client_secret,
            connection.refresh_token,
            connection.folder_name or "папка",
            folder_id=connection.folder_id,
            scope=drive_connection.DRIVE_FULL_SCOPE,
        )
    if settings.gdrive_refresh_token:
        return DriveStore(
            settings.gdrive_client_id,
            settings.gdrive_client_secret,
            settings.gdrive_refresh_token,
            settings.gdrive_folder,
        )
    if not settings.gcs_bucket:
        return None
    prefix = settings.gcs_prefix
    if prefix and not prefix.endswith("/"):
        prefix += "/"
    return GcsStore(settings.gcs_bucket, prefix, settings.gcs_credentials)


def create_cloud_backup(engine: Engine, store: BackupStore) -> BackupObject:
    """Takes a consistent snapshot of the database, compresses it and uploads it."""
    name = f"probnik-{utcnow():%Y%m%d-%H%M%S}.db.gz"
    with tempfile.TemporaryDirectory() as folder:
        snapshot = backup_database(engine, Path(folder) / "snapshot.db")
        packed = Path(folder) / name
        with snapshot.open("rb") as source, gzip.open(packed, "wb") as target:
            shutil.copyfileobj(source, target)
        return store.upload(packed, name)


def check(store: BackupStore | None) -> dict:
    """The state of the latest backup, for the backups tab and the import step."""
    if store is None:
        return {"configured": False, "bucket": None, "latest": None, "stale": True, "backups": []}
    backups = [item for item in store.list() if is_backup(item.name)]
    latest = backups[0] if backups else None
    return {
        "configured": True,
        "bucket": store.bucket,
        "latest": latest,
        "stale": latest is None or utcnow() - latest.created > STALE_AFTER,
        "backups": backups[:KEEP_LISTED],
    }
