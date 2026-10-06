from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, OperationalError

from app.api import (
    backups,
    exam_events,
    exams,
    groups,
    imports,
    memberships,
    participations,
    student_portal,
    students,
    subjects,
    teacher_portal,
    teachers,
)
from app.api.dependencies import require_operator
from app.config import STATIC_ROOT, Settings
from app.database import make_engine
from app.services.drive_connection import Flows


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    engine = make_engine(settings.database_url)

    @asynccontextmanager
    async def lifespan(app):
        yield
        engine.dispose()

    app = FastAPI(title="Пробник API", version="0.1.0", lifespan=lifespan)
    app.state.settings, app.state.engine = settings, engine
    app.state.backup_store = None  # tests put a fake store here; otherwise it follows the settings
    app.state.drive_flows = Flows()
    for module in (
        backups,
        students,
        groups,
        subjects,
        teachers,
        exams,
        exam_events,
        participations,
        imports,
        memberships,
    ):
        app.include_router(module.router, prefix="/api", dependencies=[Depends(require_operator)])
    app.include_router(backups.callback_router)
    app.include_router(student_portal.router)
    app.include_router(teacher_portal.router)

    @app.get("/api/session", dependencies=[Depends(require_operator)])
    def operator_session():
        return {"authenticated": True}

    @app.get("/health", tags=["system"])
    def health():
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return {"status": "ok"}

    @app.exception_handler(ValueError)
    async def invalid_input(request: Request, error: ValueError):
        return JSONResponse(status_code=422, content={"detail": str(error)})

    @app.exception_handler(IntegrityError)
    async def conflict(request: Request, error: IntegrityError):
        return JSONResponse(status_code=409, content={"detail": "Дубликат или нарушение связей БД"})

    @app.exception_handler(OperationalError)
    async def unavailable(request: Request, error: OperationalError):
        return JSONResponse(
            status_code=503, content={"detail": "База недоступна. Проверьте миграции"}
        )

    if STATIC_ROOT.is_dir():
        app.mount("/", StaticFiles(directory=STATIC_ROOT, html=True), name="frontend")
    return app
