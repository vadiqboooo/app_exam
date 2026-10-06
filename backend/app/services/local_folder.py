import json
import shutil
from datetime import UTC, datetime
from pathlib import Path

from app.config import Settings
from app.services.cloud_backup import BackupObject


class LocalFolderStore:
    """Backups in an ordinary folder that a cloud client keeps in sync.

    Yandex Disk, Google Drive for desktop, Dropbox or OneDrive upload whatever lands in their
    folder, so the app needs no account, token or API: only the path.
    """

    def __init__(self, folder: str):
        self.folder = Path(folder).expanduser()
        self.bucket = f"Папка · {self.folder}"

    def check_access(self) -> None:
        """Proves the folder can be written to (it is created if missing)."""
        self.folder.mkdir(parents=True, exist_ok=True)
        probe = self.folder / ".probnik-check"
        try:
            probe.write_text("ok", encoding="utf-8")
        except OSError as error:
            raise RuntimeError(f"в папку нельзя записывать ({error.strerror or error})") from error
        probe.unlink(missing_ok=True)

    def list(self) -> list[BackupObject]:
        if not self.folder.is_dir():
            return []
        items = []
        for path in self.folder.iterdir():
            if not path.is_file() or path.name.startswith(".") or path.suffix == ".part":
                continue
            info = path.stat()
            modified = datetime.fromtimestamp(info.st_mtime, UTC).replace(tzinfo=None)
            items.append(BackupObject(path.name, info.st_size, modified))
        return sorted(items, key=lambda item: item.created, reverse=True)

    def download(self, name: str) -> bytes:
        if Path(name).name != name:
            raise RuntimeError("недопустимое имя файла")
        return (self.folder / name).read_bytes()

    def upload(self, path: Path, name: str) -> BackupObject:
        self.folder.mkdir(parents=True, exist_ok=True)
        target = self.folder / name
        # The sync client must never pick up a half-written file, so it appears only when complete.
        partial = self.folder / f"{name}.part"
        shutil.copyfile(path, partial)
        partial.replace(target)
        info = target.stat()
        modified = datetime.fromtimestamp(info.st_mtime, UTC).replace(tzinfo=None)
        return BackupObject(name, info.st_size, modified)


def load(settings: Settings) -> LocalFolderStore | None:
    path = Path(settings.folder_file)
    if not path.is_file():
        return None
    return LocalFolderStore(json.loads(path.read_text(encoding="utf-8"))["path"])


def save(settings: Settings, store: LocalFolderStore) -> None:
    path = Path(settings.folder_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"path": str(store.folder)}, ensure_ascii=False), encoding="utf-8")


def forget(settings: Settings) -> None:
    Path(settings.folder_file).unlink(missing_ok=True)
