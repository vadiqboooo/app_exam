import gzip
import sqlite3
from datetime import timedelta

from app.services.cloud_backup import BackupObject
from app.time import utcnow


class FakeStore:
    bucket = "school-backups"

    def __init__(self):
        self.objects: list[BackupObject] = []
        self.files: dict[str, bytes] = {}

    def list(self):
        return sorted(self.objects, key=lambda item: item.created, reverse=True)

    def upload(self, path, name):
        data = path.read_bytes()
        self.files[name] = data
        item = BackupObject(name, len(data), utcnow())
        self.objects.append(item)
        return item


def test_not_configured(client):
    state = client.get("/api/backups").json()
    assert state["configured"] is False and state["stale"] is True
    assert client.post("/api/backups").status_code == 422


def test_backup_is_uploaded_as_a_restorable_database(client, tmp_path):
    client.app.state.backup_store = store = FakeStore()
    created = client.post("/api/backups")
    assert created.status_code == 201
    name = created.json()["name"]
    assert name.startswith("probnik-") and name.endswith(".db.gz")
    restored = tmp_path / "restored.db"
    restored.write_bytes(gzip.decompress(store.files[name]))
    with sqlite3.connect(restored) as database:
        assert database.execute("SELECT count(*) FROM alembic_version").fetchone()[0] == 1
    state = client.get("/api/backups").json()
    assert state["configured"] and not state["stale"]
    assert state["latest"]["name"] == name and state["bucket"] == "school-backups"


def test_old_backup_is_stale(client):
    store = client.app.state.backup_store = FakeStore()
    store.objects.append(
        BackupObject("probnik-20260101-000000.db.gz", 10, utcnow() - timedelta(days=3))
    )
    assert client.get("/api/backups").json()["stale"] is True


def test_import_preview_reports_the_last_backup(client):
    from tests.test_school_import import GROUPS, files

    store = client.app.state.backup_store = FakeStore()
    preview = client.post("/api/imports/run/preview", files=files(groups=GROUPS)).json()
    assert preview["backup"]["stale"] is True and preview["backup"]["latest"] is None
    client.post("/api/backups")
    preview = client.post("/api/imports/run/preview", files=files(groups=GROUPS)).json()
    assert preview["backup"]["stale"] is False
    assert preview["backup"]["latest"]["name"] == store.objects[0].name


def test_unreachable_cloud_does_not_block_the_import(client):
    from tests.test_school_import import GROUPS, files

    class Broken(FakeStore):
        def list(self):
            raise RuntimeError("нет сети")

        def upload(self, path, name):
            raise RuntimeError("нет сети")

    client.app.state.backup_store = Broken()
    broken = client.get("/api/backups")
    assert broken.status_code == 200 and "нет сети" in broken.json()["error"]
    assert client.post("/api/backups").status_code == 502
    preview = client.post("/api/imports/run/preview", files=files(groups=GROUPS))
    assert preview.status_code == 200 and "нет сети" in preview.json()["backup"]["error"]


class FakeDrive:
    """Just enough of the Drive REST API: one folder, files with names and times."""

    def __init__(self, folder_exists=True):
        self.calls = []
        self.folders = [{"id": "folder-1"}] if folder_exists else []
        self.files = [
            {"name": "old.db.gz", "size": "2048", "createdTime": "2026-10-01T09:00:00.000Z"},
            {"name": "new.db.gz", "size": "4096", "createdTime": "2026-10-05T12:30:00.000+08:00"},
        ]

    def request(self, method, url, **options):
        self.calls.append((method, url, options))
        if method == "GET" and "mimeType" in options["params"]["q"]:
            body = {"files": self.folders}
        elif method == "GET":
            body = {"files": self.files}
        elif method == "POST" and "json" in options:
            self.folders = [{"id": "folder-new"}]
            body = {"id": "folder-new"}
        else:
            body = {
                "name": "uploaded.db.gz",
                "size": "3",
                "createdTime": "2026-10-05T10:00:00.000Z",
            }
        return type("Response", (), {"status_code": 200, "json": lambda self_: body, "text": ""})()


def drive_store(session):
    from app.services.cloud_backup import DriveStore

    return DriveStore("id", "secret", "token", "Probnik backups", session=session)


def test_drive_lists_backups_with_utc_times():
    items = drive_store(FakeDrive()).list()
    assert [item.name for item in items] == ["old.db.gz", "new.db.gz"]
    assert items[0].created.isoformat() == "2026-10-01T09:00:00" and items[0].size == 2048
    assert items[1].created.isoformat() == "2026-10-05T04:30:00"


def test_drive_without_folder_has_no_backups():
    assert drive_store(FakeDrive(folder_exists=False)).list() == []


def test_drive_upload_creates_the_folder_and_sends_the_file(tmp_path):
    session = FakeDrive(folder_exists=False)
    packed = tmp_path / "file.db.gz"
    packed.write_bytes(b"abc")
    item = drive_store(session).upload(packed, "uploaded.db.gz")
    assert item.name == "uploaded.db.gz" and item.size == 3
    created = [call for call in session.calls if call[0] == "POST" and "json" in call[2]]
    assert created[0][2]["json"]["name"] == "Probnik backups"
    upload = session.calls[-1]
    assert upload[2]["params"]["uploadType"] == "multipart"
    assert b'"parents": ["folder-new"]' in upload[2]["data"] and b"abc" in upload[2]["data"]


def test_drive_is_chosen_when_a_token_is_set(tmp_path):
    from app.config import Settings
    from app.services.cloud_backup import DriveStore, GcsStore, make_store

    # Empty settings files, so a connection the developer made in the app is not picked up.
    def settings(**options):
        return Settings(
            gdrive_file=str(tmp_path / "drive.json"),
            webdav_file=str(tmp_path / "webdav.json"),
            folder_file=str(tmp_path / "folder.json"),
            yandex_file=str(tmp_path / "yandex.json"),
            gdrive_client_file=str(tmp_path / "client.json"),
            **options,
        )

    drive = make_store(settings(gdrive_refresh_token="t", gcs_bucket="b"))
    assert isinstance(drive, DriveStore) and drive.bucket.startswith("Google Drive")
    assert isinstance(make_store(settings(gcs_bucket="b")), GcsStore)
    assert make_store(settings()) is None


def test_folder_link_is_parsed():
    from app.services.drive_connection import parse_folder_id

    folder = "1AbCdEfGhIjKlMnOpQrStUvWx"
    assert parse_folder_id(f"https://drive.google.com/drive/folders/{folder}?usp=sharing") == folder
    assert parse_folder_id(f"https://drive.google.com/drive/u/0/folders/{folder}") == folder
    assert parse_folder_id(f"https://drive.google.com/open?id={folder}") == folder
    assert parse_folder_id(folder) == folder
    import pytest

    with pytest.raises(ValueError):
        parse_folder_id("https://example.com/nothing")


def write_client(client, kind="web"):
    import json
    from pathlib import Path

    path = Path(client.app.state.settings.gdrive_client_file)
    path.write_text(
        json.dumps({kind: {"client_id": "cid.apps.googleusercontent.com", "client_secret": "sec"}})
    )


def test_drive_panel_state_before_and_after_the_client_file(client):
    drive = client.get("/api/backups").json()["drive"]
    assert drive["client_configured"] is False and drive["connected"] is False
    assert drive["redirect_uri"].endswith("/api/backups/drive/callback")
    write_client(client)
    assert client.get("/api/backups").json()["drive"]["client_configured"] is True


def test_connect_needs_the_client_file_and_a_folder(client):
    folder = "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWx"
    assert client.post("/api/backups/drive", json={"folder_url": folder}).status_code == 422
    write_client(client)
    assert client.post("/api/backups/drive", json={"folder_url": "ерунда"}).status_code == 422
    url = client.post("/api/backups/drive", json={"folder_url": folder}).json()["url"]
    assert url.startswith("https://accounts.google.com/") and "access_type=offline" in url
    assert "redirect_uri=http%3A%2F%2Ftestserver%2Fapi%2Fbackups%2Fdrive%2Fcallback" in url


def test_callback_rejects_an_unknown_state_without_a_session(client):
    # Google's redirect carries no Authorization header, so it must work without one.
    response = client.get(
        "/api/backups/drive/callback?state=nope&code=x",
        headers={"Authorization": ""},
        follow_redirects=False,
    )
    assert response.status_code == 303 and "drive_error=" in response.headers["location"]
    assert client.get("/api/backups").json()["drive"]["connected"] is False


def test_drive_sign_in_connects_the_folder_and_can_be_undone(client, monkeypatch):
    import app.api.backups as backups_api

    write_client(client)
    folder = "1AbCdEfGhIjKlMnOpQrStUvWx"
    url = client.post(
        "/api/backups/drive",
        json={"folder_url": f"https://drive.google.com/drive/folders/{folder}"},
    ).json()["url"]
    state = url.split("state=")[1].split("&")[0]

    class Probe:
        def __init__(self, *args, folder_id=None, **kwargs):
            assert folder_id == folder

        def folder_name(self):
            return "Школа · копии"

        def list(self):
            return []

    monkeypatch.setattr(backups_api, "DriveStore", Probe)
    monkeypatch.setattr(
        backups_api.drive_connection, "finish", lambda flows, s, code, uri: ("refresh-1", folder)
    )
    done = client.get(
        f"/api/backups/drive/callback?state={state}&code=abc",
        headers={"Authorization": ""},
        follow_redirects=False,
    )
    assert done.status_code == 303 and done.headers["location"].endswith("?drive=ok")
    drive = client.get("/api/backups").json()["drive"]
    assert drive["connected"] is True and drive["folder_name"] == "Школа · копии"

    from app.services.cloud_backup import DriveStore, make_store

    store = make_store(client.app.state.settings)
    assert isinstance(store, DriveStore) and store.folder_id == folder
    assert client.delete("/api/backups/drive").status_code == 204
    assert client.get("/api/backups").json()["drive"]["connected"] is False


PROPFIND = """<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
 <d:response><d:href>/Probnik%20backups/</d:href><d:propstat><d:prop>
  <d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
 <d:response><d:href>/Probnik%20backups/old.db.gz</d:href><d:propstat><d:prop>
  <d:getcontentlength>2048</d:getcontentlength>
  <d:getlastmodified>Thu, 01 Oct 2026 09:00:00 GMT</d:getlastmodified></d:prop></d:propstat>
 </d:response>
 <d:response><d:href>/Probnik%20backups/new%20one.db.gz</d:href><d:propstat><d:prop>
  <d:getcontentlength>4096</d:getcontentlength>
  <d:getlastmodified>Mon, 05 Oct 2026 12:00:00 GMT</d:getlastmodified></d:prop></d:propstat>
 </d:response>
</d:multistatus>"""


class FakeDav:
    def __init__(self, status=207, folder_status=201):
        self.calls, self.status, self.folder_status = [], status, folder_status

    def request(self, method, url, **options):
        self.calls.append((method, url, options))
        code = {"PROPFIND": self.status, "MKCOL": self.folder_status, "PUT": 201}[method]
        return type("Response", (), {"status_code": code, "content": PROPFIND.encode()})()


class DeniedDav(FakeDav):
    def request(self, method, url, **options):
        return type("Response", (), {"status_code": 401, "content": b""})()


def dav_store(session):
    from app.services.webdav import WebDavStore

    return WebDavStore(
        "https://webdav.yandex.ru/", "me@yandex.ru", "pw", "Probnik backups", session
    )


def test_webdav_lists_files_newest_first_and_skips_the_folder():
    items = dav_store(FakeDav()).list()
    assert [item.name for item in items] == ["new one.db.gz", "old.db.gz"]
    assert items[0].size == 4096 and items[0].created.isoformat() == "2026-10-05T12:00:00"


def test_webdav_missing_folder_has_no_backups():
    assert dav_store(FakeDav(status=404)).list() == []


def test_webdav_upload_makes_the_folder_then_puts_the_file(tmp_path):
    session = FakeDav(folder_status=405)  # the folder already exists
    packed = tmp_path / "x.db.gz"
    packed.write_bytes(b"abc")
    item = dav_store(session).upload(packed, "a b.db.gz")
    assert item.size == 3
    assert [call[0] for call in session.calls] == ["MKCOL", "PUT"]
    assert session.calls[1][1] == "https://webdav.yandex.ru/Probnik%20backups/a%20b.db.gz"
    assert session.calls[1][2]["data"] == b"abc"


def test_webdav_wrong_password_is_explained():
    import pytest

    with pytest.raises(RuntimeError, match="пароль"):
        dav_store(DeniedDav()).list()


def test_webdav_connect_checks_then_saves_and_disconnects(client, monkeypatch):
    import app.services.webdav as webdav_module

    monkeypatch.setattr(webdav_module.WebDavStore, "_http", lambda self: FakeDav())
    assert client.get("/api/backups").json()["webdav"]["connected"] is False
    done = client.post("/api/backups/webdav", json={"login": "me@yandex.ru", "password": "pw"})
    assert done.status_code == 200 and done.json() == {
        "connected": True,
        "host": "webdav.yandex.ru",
        "folder": "Probnik backups",
    }
    state = client.get("/api/backups").json()
    assert state["configured"] and state["bucket"].startswith("webdav.yandex.ru")
    assert state["backups"] == []  # these names are not copies made by this app
    legacy = client.get("/api/backups/legacy").json()
    assert [f["name"] for f in legacy["files"]] == ["new one.db.gz", "old.db.gz"]
    assert client.delete("/api/backups/webdav").status_code == 204
    assert client.get("/api/backups").json()["webdav"]["connected"] is False


def test_webdav_connect_rejects_a_bad_login_and_saves_nothing(client, monkeypatch):
    import app.services.webdav as webdav_module

    monkeypatch.setattr(webdav_module.WebDavStore, "_http", lambda self: DeniedDav())
    bad = client.post("/api/backups/webdav", json={"login": "me", "password": "wrong"})
    assert bad.status_code == 422 and "пароль" in bad.json()["detail"]
    assert client.get("/api/backups").json()["webdav"]["connected"] is False
    empty = client.post("/api/backups/webdav", json={"login": " ", "password": ""})
    assert empty.status_code == 422


def test_webdav_error_says_which_step_failed_and_what_the_server_said():
    import pytest

    class Refused(FakeDav):
        def request(self, method, url, **options):
            return type(
                "Response", (), {"status_code": 402, "content": b"", "text": "Payment  Required"}
            )()

    with pytest.raises(RuntimeError, match=r"402 \(создание папки\): Payment Required"):
        dav_store(Refused()).check_access()


def test_folder_store_copies_lists_and_ignores_other_files(tmp_path):
    from app.services.local_folder import LocalFolderStore

    store = LocalFolderStore(str(tmp_path / "sync" / "backups"))
    assert store.list() == []  # the folder does not exist yet
    packed = tmp_path / "src.db.gz"
    packed.write_bytes(b"abc")
    item = store.upload(packed, "probnik-20261005-120000.db.gz")
    assert item.size == 3 and abs((utcnow() - item.created).total_seconds()) < 60
    (store.folder / "notes.txt").write_text("not a backup")
    (store.folder / "probnik-20261005-130000.db.gz.part").write_bytes(b"half")
    names = sorted(found.name for found in store.list())
    assert names == ["notes.txt", "probnik-20261005-120000.db.gz"]  # no half-written .part


def test_folder_connect_creates_checks_and_disconnects(client, tmp_path):
    folder = tmp_path / "Yandex.Disk" / "Probnik"
    assert client.get("/api/backups").json()["folder"]["connected"] is False
    done = client.post("/api/backups/folder", json={"path": f'"{folder}"'})
    assert done.status_code == 200 and done.json() == {"connected": True, "path": str(folder)}
    assert folder.is_dir()
    created = client.post("/api/backups")
    assert created.status_code == 201
    state = client.get("/api/backups").json()
    assert state["configured"] and state["bucket"].startswith("Папка")
    assert state["latest"]["name"] == created.json()["name"] and state["stale"] is False
    assert (folder / created.json()["name"]).is_file()
    assert client.delete("/api/backups/folder").status_code == 204
    assert client.get("/api/backups").json()["folder"]["connected"] is False


def test_folder_connect_rejects_an_empty_or_unusable_path(client, tmp_path):
    assert client.post("/api/backups/folder", json={"path": "  "}).status_code == 422
    blocker = tmp_path / "file.txt"
    blocker.write_text("x")
    unusable = client.post("/api/backups/folder", json={"path": str(blocker / "inside")})
    assert unusable.status_code == 422
    assert client.get("/api/backups").json()["folder"]["connected"] is False


class FakeYandex:
    """The Yandex Disk REST calls the app makes; `app_folder` is the kind of token."""

    LISTING = {
        "_embedded": {
            "items": [
                {
                    "name": "old.db.gz",
                    "type": "file",
                    "size": 2048,
                    "created": "2026-10-01T09:00:00+00:00",
                },
                {"name": "sub", "type": "dir", "created": "2026-10-02T09:00:00+00:00"},
                {
                    "name": "new.db.gz",
                    "type": "file",
                    "size": 4096,
                    "created": "2026-10-05T20:00:00+08:00",
                },
            ]
        }
    }

    def __init__(self, app_folder=True, token_ok=True):
        self.calls, self.app_folder, self.token_ok = [], app_folder, token_ok

    def request(self, method, url, **options):
        self.calls.append((method, url, options))
        params = options.get("params", {})
        status, body = 200, {}
        if not self.token_ok:
            status = 401
        elif url.endswith("/resources/upload"):
            body = {"href": "https://uploader.example/put"}
        elif url.startswith("https://uploader.example"):
            status = 201
        elif method == "PUT":
            status = 201
        elif params.get("path") == "app:/" and not self.app_folder and params.get("limit") == 1:
            status = 403
        else:
            body = self.LISTING
        return type("Response", (), {"status_code": status, "json": lambda self_: body})()


def yandex_store(session, root=None):
    from app.services.yandex_disk import YandexDiskStore

    return YandexDiskStore("token", "Probnik backups", root, session)


def small_file():
    import tempfile
    from pathlib import Path

    path = Path(tempfile.mkdtemp()) / "x.db.gz"
    path.write_bytes(b"abc")
    return path


def test_yandex_lists_files_only_newest_first():
    items = yandex_store(FakeYandex()).list()
    assert [item.name for item in items] == ["new.db.gz", "old.db.gz"]
    assert items[0].created.isoformat() == "2026-10-05T12:00:00" and items[0].size == 4096


def test_yandex_app_folder_token_uploads_to_the_app_folder():
    session = FakeYandex(app_folder=True)
    store = yandex_store(session)
    store.upload(small_file(), "a.db.gz")
    asked = [call for call in session.calls if call[1].endswith("/resources/upload")][0]
    assert asked[2]["params"]["path"] == "app:/a.db.gz"
    assert asked[2]["headers"]["Authorization"] == "OAuth token"
    put = session.calls[-1]
    assert put[0] == "PUT" and put[1] == "https://uploader.example/put" and put[2]["headers"] == {}
    assert store.bucket.endswith("папка приложения")
    made = [call for call in session.calls if call[0] == "PUT" and call[1].endswith("/resources")]
    assert not made


def test_yandex_full_access_token_makes_its_own_folder():
    session = FakeYandex(app_folder=False)
    store = yandex_store(session)
    store.check_access()
    assert store.root == "disk:/Probnik backups"
    made = [call for call in session.calls if call[0] == "PUT" and call[1].endswith("/resources")]
    assert made and made[0][2]["params"] == {"path": "disk:/Probnik backups"}
    again = FakeYandex(app_folder=False)
    yandex_store(again, root="disk:/Probnik backups").upload(small_file(), "b.db.gz")
    paths = [call[2].get("params", {}).get("path") for call in again.calls]
    assert "disk:/Probnik backups/b.db.gz" in paths


def test_yandex_bad_token_is_explained():
    import pytest

    with pytest.raises(RuntimeError, match="токен"):
        yandex_store(FakeYandex(token_ok=False)).check_access()


def test_yandex_connect_checks_then_saves_and_disconnects(client, monkeypatch):
    import app.services.yandex_disk as yandex_module

    monkeypatch.setattr(yandex_module.YandexDiskStore, "_http", lambda self: FakeYandex())
    assert client.get("/api/backups").json()["yandex"]["connected"] is False
    done = client.post("/api/backups/yandex", json={"token": " y0_abc "})
    assert done.status_code == 200
    assert done.json() == {"connected": True, "where": "папка приложения", "client_id": None}
    state = client.get("/api/backups").json()
    assert state["configured"] and state["bucket"].startswith("Яндекс Диск")
    assert state["backups"] == []  # these names are not copies made by this app
    legacy = client.get("/api/backups/legacy").json()
    assert [f["name"] for f in legacy["files"]] == ["new.db.gz", "old.db.gz"]
    assert client.delete("/api/backups/yandex").status_code == 204
    assert client.get("/api/backups").json()["yandex"]["connected"] is False


def test_yandex_connect_rejects_a_bad_token_and_saves_nothing(client, monkeypatch):
    import app.services.yandex_disk as yandex_module

    monkeypatch.setattr(
        yandex_module.YandexDiskStore, "_http", lambda self: FakeYandex(token_ok=False)
    )
    bad = client.post("/api/backups/yandex", json={"token": "wrong"})
    assert bad.status_code == 422 and "токен" in bad.json()["detail"]
    assert client.get("/api/backups").json()["yandex"]["connected"] is False
    assert client.post("/api/backups/yandex", json={"token": "  "}).status_code == 422


def test_legacy_files_come_from_the_connected_folder(client, tmp_path):
    assert client.get("/api/backups/legacy").json() == {"configured": False, "files": []}
    folder = tmp_path / "sync"
    client.post("/api/backups/folder", json={"path": str(folder)})
    assert client.get("/api/backups/legacy").json() == {"configured": True, "files": []}
    (folder / "old-app.db").write_bytes(b"SQLite format 3\x00legacy")
    (folder / "old-app-2.db.gz").write_bytes(gzip.compress(b"SQLite format 3\x00packed"))
    (folder / "notes.txt").write_text("x")
    client.post("/api/backups")  # a copy made by this app is not a previous version
    listed = client.get("/api/backups/legacy").json()["files"]
    previous = [item["name"] for item in listed if not item["current"]]
    assert sorted(previous) == ["old-app-2.db.gz", "old-app.db"]
    current = [item["name"] for item in listed if item["current"]]
    assert len(current) == 1 and current[0].startswith("probnik-")  # shown, but not selectable
    assert client.get(f"/api/backups/files/{current[0]}").status_code == 404
    assert client.get("/api/backups/files/old-app.db").content == b"SQLite format 3\x00legacy"
    assert client.get("/api/backups/files/old-app-2.db.gz").content == b"SQLite format 3\x00packed"
    assert client.get("/api/backups/files/notes.txt").status_code == 404
    assert client.get("/api/backups/files/..%2Fsecret.db").status_code == 404
    backups = [item["name"] for item in client.get("/api/backups").json()["backups"]]
    assert len(backups) == 1 and backups[0].startswith("probnik-")


def test_legacy_download_rejects_a_broken_archive(client, tmp_path):
    folder = tmp_path / "sync"
    client.post("/api/backups/folder", json={"path": str(folder)})
    (folder / "broken.db.gz").write_bytes(b"this is not gzip")
    assert client.get("/api/backups/files/broken.db.gz").status_code == 422


def response(status, body=None, content=b""):
    return type(
        "Response",
        (),
        {"status_code": status, "json": lambda self: body, "content": content, "text": ""},
    )()


def test_yandex_downloads_through_the_link_it_is_given():
    class Downloading(FakeYandex):
        def request(self, method, url, **options):
            if url.endswith("/resources/download"):
                self.calls.append((method, url, options))
                return response(200, {"href": "https://downloader.example/get"})
            if url.startswith("https://downloader.example"):
                self.calls.append((method, url, options))
                return response(200, content=b"legacy-bytes")
            return super().request(method, url, **options)

    session = Downloading(app_folder=True)
    assert yandex_store(session).download("old.db") == b"legacy-bytes"
    asked = [call for call in session.calls if call[1].endswith("/resources/download")][0]
    assert asked[2]["params"]["path"] == "app:/old.db"
    assert session.calls[-1][2]["headers"] == {}  # the token is not sent to the storage host


def test_webdav_downloads_a_file():
    class Getting(FakeDav):
        def request(self, method, url, **options):
            if method == "GET":
                self.calls.append((method, url, options))
                return response(200, content=b"dav-bytes")
            return super().request(method, url, **options)

    session = Getting()
    assert dav_store(session).download("old app.db") == b"dav-bytes"
    assert session.calls[-1][1] == "https://webdav.yandex.ru/Probnik%20backups/old%20app.db"


def test_drive_downloads_a_file_by_name():
    class Serving(FakeDrive):
        def request(self, method, url, **options):
            params = options.get("params", {})
            if method == "GET" and params.get("alt") == "media":
                self.calls.append((method, url, options))
                return response(200, content=b"drive-bytes")
            if method == "GET" and "name='" in params.get("q", ""):
                self.calls.append((method, url, options))
                return response(200, {"files": [{"id": "file-1"}]})
            return super().request(method, url, **options)

    session = Serving()
    assert drive_store(session).download("old.db") == b"drive-bytes"
    assert session.calls[-1][1].endswith("/files/file-1")


def connect_folder(client, tmp_path):
    folder = tmp_path / "sync"
    assert client.post("/api/backups/folder", json={"path": str(folder)}).status_code == 200
    return folder


def subject_names(client):
    return [item["name"] for item in client.get("/api/subjects").json()]


def test_restore_brings_back_the_state_of_the_copy(client, tmp_path):
    from pathlib import Path

    from tests.test_subjects import subject_payload

    connect_folder(client, tmp_path)
    name = client.post("/api/backups").json()["name"]
    assert client.post("/api/subjects", json=subject_payload()).status_code in (200, 201)
    assert "Астрономия" in subject_names(client)

    done = client.post("/api/backups/restore", json={"name": name})
    assert done.status_code == 200 and done.json()["restored"] == name
    assert "Астрономия" not in subject_names(client)  # the data of the copy is back
    # The work done after the copy was saved before it was replaced.
    safety = Path(done.json()["safety_copy"])
    assert safety.is_file() and safety.parent.name == "before-restore"
    with sqlite3.connect(safety) as database:
        found = database.execute("SELECT count(*) FROM subjects WHERE name='Астрономия'")
        assert found.fetchone()[0] == 1
    # The app keeps working on the restored database.
    other = client.post("/api/subjects", json=subject_payload(name="Другой"))
    assert other.status_code in (200, 201)
    assert "Другой" in subject_names(client)


def test_restore_refuses_what_is_not_a_copy_of_this_app(client, tmp_path):
    assert client.post("/api/backups/restore", json={"name": "x"}).status_code == 422  # no disk
    folder = connect_folder(client, tmp_path)
    missing = client.post("/api/backups/restore", json={"name": "probnik-nope.db.gz"})
    assert missing.status_code == 422
    (folder / "old-app.db").write_bytes(b"SQLite format 3\x00legacy")
    assert client.post("/api/backups/restore", json={"name": "old-app.db"}).status_code == 422
    other = tmp_path / "other.db"
    with sqlite3.connect(other) as database:
        database.execute("CREATE TABLE something (id integer)")
    (folder / "probnik-20260101-000000.db.gz").write_bytes(gzip.compress(other.read_bytes()))
    stranger = client.post("/api/backups/restore", json={"name": "probnik-20260101-000000.db.gz"})
    assert stranger.status_code == 422 and "не копия" in stranger.json()["detail"]
    (folder / "probnik-20260102-000000.db.gz").write_bytes(b"not gzip at all")
    broken = client.post("/api/backups/restore", json={"name": "probnik-20260102-000000.db.gz"})
    assert broken.status_code == 422
    assert not (tmp_path / "before-restore").exists()  # nothing was touched


def test_yandex_app_id_comes_from_the_settings(tmp_path):
    from fastapi.testclient import TestClient

    from app.config import Settings
    from app.main import create_app

    settings = Settings(
        database_url=f"sqlite:///{(tmp_path / 'probnik.db').as_posix()}",
        api_key="k",
        yandex_client_id="abc123",
        yandex_file=str(tmp_path / "yandex.json"),
        webdav_file=str(tmp_path / "webdav.json"),
        folder_file=str(tmp_path / "folder.json"),
        gdrive_file=str(tmp_path / "drive.json"),
    )
    with TestClient(create_app(settings), headers={"Authorization": "Bearer k"}) as client:
        assert client.get("/api/backups").json()["yandex"]["client_id"] == "abc123"
