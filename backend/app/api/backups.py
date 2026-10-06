import gzip
import zlib
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel

from app.api.dependencies import require_admin
from app.services import drive_connection, local_folder, webdav, yandex_disk
from app.services.cloud_backup import (
    BackupObject,
    BackupStore,
    DriveStore,
    check,
    create_cloud_backup,
    is_backup,
    is_legacy,
    make_store,
)
from app.services.restore import restore_backup

router = APIRouter(prefix="/backups", tags=["backups"], dependencies=[Depends(require_admin)])
# Google sends the browser back here without our session, so it sits outside the admin check;
# it only completes a sign-in that an administrator started (single-use `state`).
callback_router = APIRouter(prefix="/api/backups", include_in_schema=False)


class DriveFolder(BaseModel):
    folder_url: str


class RestoreRequest(BaseModel):
    name: str


class YandexToken(BaseModel):
    token: str
    folder: str = "Probnik backups"


class FolderPath(BaseModel):
    path: str


class WebDavLogin(BaseModel):
    login: str
    password: str
    folder: str = "Probnik backups"
    url: str = webdav.YANDEX_URL


def store_of(request: Request) -> BackupStore | None:
    override = request.app.state.backup_store
    return override if override is not None else make_store(request.app.state.settings)


def redirect_uri(request: Request) -> str:
    return f"{request.base_url}api/backups/drive/callback"


def drive_info(request: Request) -> dict:
    settings = request.app.state.settings
    connection = drive_connection.load(settings)
    return {
        "client_configured": drive_connection.client_config(settings) is not None,
        "connected": connection is not None,
        "folder_name": connection.folder_name if connection else None,
        "redirect_uri": redirect_uri(request),
    }


def yandex_info(request: Request) -> dict:
    store = yandex_disk.load(request.app.state.settings)
    return {
        "connected": store is not None,
        "where": store.bucket.split(" · ")[1] if store else None,
        "client_id": request.app.state.settings.yandex_client_id or None,
    }


def folder_info(request: Request) -> dict:
    store = local_folder.load(request.app.state.settings)
    return {"connected": store is not None, "path": str(store.folder) if store else None}


def webdav_info(request: Request) -> dict:
    store = webdav.load(request.app.state.settings)
    return {
        "connected": store is not None,
        "host": store.bucket.split(" · ")[0] if store else None,
        "folder": store.folder if store else None,
    }


def cloud_error(error: Exception) -> HTTPException:
    if isinstance(error, ValueError):
        return HTTPException(422, str(error))
    return HTTPException(502, f"Облако недоступно: {error}")


def backup_state(request: Request) -> dict:
    """Never fails: an unreachable cloud must not block the screen that asks about it."""
    try:
        return check(store_of(request))
    except Exception as error:
        return {"configured": True, "error": str(error)}


@router.get("")
def backups(request: Request):
    # An unreachable cloud is part of the state, so the person can still disconnect or reconnect.
    return {
        **backup_state(request),
        "drive": drive_info(request),
        "webdav": webdav_info(request),
        "folder": folder_info(request),
        "yandex": yandex_info(request),
    }


@router.post("/restore")
def restore(form: RestoreRequest, request: Request):
    """Replaces the working database with a copy from the connected disk."""
    store = store_of(request)
    if store is None:
        raise HTTPException(422, "Диск не подключён")
    try:
        safety = restore_backup(request.app.state.engine, store, form.name)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    except Exception as error:
        raise cloud_error(error) from error
    return {"restored": form.name, "safety_copy": str(safety)}


@router.get("/legacy")
def legacy_files(request: Request):
    """Database files on the connected disk: the previous version (selectable) and the copies
    of the current one (listed so the person sees them, but `current` ones cannot be chosen)."""
    store = store_of(request)
    if store is None:
        return {"configured": False, "files": []}
    try:
        files = [
            {"name": i.name, "size": i.size, "created": i.created, "current": is_backup(i.name)}
            for i in store.list()
            if is_legacy(i.name) or is_backup(i.name)
        ]
        return {"configured": True, "files": files}
    except Exception as error:
        return {"configured": True, "files": [], "error": str(error)}


@router.get("/files/{name}")
def download_legacy(name: str, request: Request):
    store = store_of(request)
    if store is None:
        raise HTTPException(422, "Диск не подключён")
    try:
        # Only names the listing offers: nothing else in the folder can be fetched through here.
        if name not in {item.name for item in store.list() if is_legacy(item.name)}:
            raise HTTPException(404, "Такого файла нет на диске")
        data = store.download(name)
    except HTTPException:
        raise
    except Exception as error:
        raise cloud_error(error) from error
    if name.lower().endswith(".gz"):
        try:
            data = gzip.decompress(data)
        except (OSError, EOFError, zlib.error) as error:
            raise HTTPException(422, "Не удалось распаковать файл .gz") from error
    return Response(data, media_type="application/octet-stream")


@router.post("", status_code=201)
def create_backup(request: Request) -> BackupObject:
    store = store_of(request)
    if store is None:
        raise HTTPException(422, "Облако не настроено: подключите Google Drive")
    try:
        return create_cloud_backup(request.app.state.engine, store)
    except Exception as error:
        raise cloud_error(error) from error


@router.post("/yandex")
def connect_yandex(form: YandexToken, request: Request):
    """Checks the token and the folder, and only then remembers them."""
    token = form.token.strip()
    if not token:
        raise HTTPException(422, "Вставьте токен Яндекса")
    store = yandex_disk.YandexDiskStore(token, form.folder)
    try:
        store.check_access()
    except Exception as error:
        raise HTTPException(422, f"Не удалось подключиться: {error}") from error
    yandex_disk.save(request.app.state.settings, store)
    return yandex_info(request)


@router.delete("/yandex", status_code=204)
def disconnect_yandex(request: Request):
    yandex_disk.forget(request.app.state.settings)


@router.post("/folder")
def connect_folder(form: FolderPath, request: Request):
    """Checks that the folder can be written to, and only then remembers it."""
    if not form.path.strip():
        raise HTTPException(422, "Укажите путь к папке")
    store = local_folder.LocalFolderStore(form.path.strip().strip('"'))
    try:
        store.check_access()
    except Exception as error:
        raise HTTPException(422, f"Не удалось использовать папку: {error}") from error
    local_folder.save(request.app.state.settings, store)
    return folder_info(request)


@router.delete("/folder", status_code=204)
def disconnect_folder(request: Request):
    local_folder.forget(request.app.state.settings)


@router.post("/webdav")
def connect_webdav(form: WebDavLogin, request: Request):
    """Checks the login and the folder, and only then remembers them."""
    if not form.login.strip() or not form.password:
        raise HTTPException(422, "Введите логин и пароль приложения")
    store = webdav.WebDavStore(form.url, form.login.strip(), form.password, form.folder)
    try:
        store.check_access()
    except Exception as error:
        raise HTTPException(422, f"Не удалось подключиться: {error}") from error
    webdav.save(request.app.state.settings, store)
    return webdav_info(request)


@router.delete("/webdav", status_code=204)
def disconnect_webdav(request: Request):
    webdav.forget(request.app.state.settings)


@router.post("/drive")
def connect_drive(folder: DriveFolder, request: Request):
    """The address of Google's sign-in page; the browser comes back through the callback."""
    url = drive_connection.begin(
        request.app.state.settings,
        request.app.state.drive_flows,
        redirect_uri(request),
        folder.folder_url,
    )
    return {"url": url}


@router.delete("/drive", status_code=204)
def disconnect_drive(request: Request):
    drive_connection.forget(request.app.state.settings)


@callback_router.get("/drive/callback")
def drive_callback(request: Request, state: str = "", code: str = "", error: str = ""):
    settings = request.app.state.settings
    try:
        if error or not code:
            raise ValueError(f"Google не подтвердил вход ({error or 'нет кода'})")
        token, folder_id = drive_connection.finish(
            request.app.state.drive_flows, state, code, redirect_uri(request)
        )
        client_id, client_secret = drive_connection.client_credentials(settings)
        probe = DriveStore(
            client_id,
            client_secret,
            token,
            "",
            folder_id=folder_id,
            scope=drive_connection.DRIVE_FULL_SCOPE,
        )
        name = probe.folder_name()  # proves the folder exists and the account can open it
        probe.list()
        drive_connection.save(settings, token, folder_id, name)
    except Exception as failure:
        return RedirectResponse(f"/#/school/backups?drive_error={quote(str(failure))}", 303)
    return RedirectResponse("/#/school/backups?drive=ok", 303)
