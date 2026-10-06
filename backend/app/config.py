import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_ROOT = Path(sys.executable).parent if getattr(sys, "frozen", False) else ROOT
STATIC_ROOT = ROOT / "frontend" if getattr(sys, "frozen", False) else ROOT.parent / "frontend/dist"


@dataclass(frozen=True)
class Settings:
    database_url: str = field(
        default_factory=lambda: os.getenv(
            "DATABASE_URL", f"sqlite:///{(DATA_ROOT / 'data/probnik.db').as_posix()}"
        )
    )
    api_key: str = field(default_factory=lambda: os.getenv("API_KEY", ""))
    # Google Cloud Storage for database backups; empty bucket means «not configured».
    gcs_bucket: str = field(default_factory=lambda: os.getenv("GCS_BUCKET", ""))
    gcs_prefix: str = field(default_factory=lambda: os.getenv("GCS_PREFIX", "probnik-backups/"))
    # Path to a service account key; the standard GOOGLE_APPLICATION_CREDENTIALS also works.
    gcs_credentials: str = field(default_factory=lambda: os.getenv("GCS_CREDENTIALS", ""))
    # Google Drive on behalf of a person (OAuth); the token comes from `python -m app drive-auth`.
    gdrive_client_id: str = field(default_factory=lambda: os.getenv("GDRIVE_CLIENT_ID", ""))
    gdrive_client_secret: str = field(default_factory=lambda: os.getenv("GDRIVE_CLIENT_SECRET", ""))
    gdrive_refresh_token: str = field(default_factory=lambda: os.getenv("GDRIVE_REFRESH_TOKEN", ""))
    # Where the in-app Drive sign-in keeps its token and where the OAuth client file is looked for.
    gdrive_file: str = field(
        default_factory=lambda: os.getenv("GDRIVE_FILE", (DATA_ROOT / "data/drive.json").as_posix())
    )
    gdrive_client_file: str = field(
        default_factory=lambda: os.getenv(
            "GDRIVE_CLIENT_FILE", (DATA_ROOT / "client_secret.json").as_posix()
        )
    )
    # Login, application password and folder for a WebDAV cloud (Yandex Disk), entered in the app.
    webdav_file: str = field(
        default_factory=lambda: os.getenv(
            "WEBDAV_FILE", (DATA_ROOT / "data/webdav.json").as_posix()
        )
    )
    # A folder that a cloud client (Yandex Disk, Drive, Dropbox) keeps in sync; set in the app.
    folder_file: str = field(
        default_factory=lambda: os.getenv(
            "FOLDER_FILE", (DATA_ROOT / "data/folder.json").as_posix()
        )
    )
    # Yandex Disk REST API token entered in the app.
    yandex_client_id: str = field(default_factory=lambda: os.getenv("YANDEX_CLIENT_ID", ""))
    yandex_file: str = field(
        default_factory=lambda: os.getenv(
            "YANDEX_FILE", (DATA_ROOT / "data/yandex.json").as_posix()
        )
    )
    gdrive_folder: str = field(
        default_factory=lambda: os.getenv("GDRIVE_FOLDER", "Probnik backups")
    )
