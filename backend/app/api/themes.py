from fastapi import APIRouter
from sqlalchemy import select

from app.api.dependencies import ReadSession
from app.models import Exam, ExamEvent, ThemeSetting

router = APIRouter(prefix="/themes", tags=["themes"])
public_router = APIRouter(prefix="/api/theme-settings", tags=["themes"])


def _read(item: ThemeSetting) -> dict:
    return {"key": item.key, "title": item.title, "is_enabled": item.is_enabled}


@public_router.get("")
def enabled_themes(session: ReadSession):
    return {
        "enabled": list(
            session.scalars(
                select(ExamEvent.theme_key)
                .join(Exam, Exam.event_id == ExamEvent.id)
                .join(ThemeSetting, ThemeSetting.key == ExamEvent.theme_key)
                .where(
                    ExamEvent.theme_key.is_not(None),
                    Exam.is_active.is_(True),
                    ThemeSetting.is_enabled.is_(True),
                )
                .distinct()
                .order_by(ExamEvent.theme_key)
            )
        )
    }


@router.get("")
def list_themes(session: ReadSession):
    items = session.scalars(
        select(ThemeSetting)
        .where(ThemeSetting.is_enabled.is_(True))
        .order_by(ThemeSetting.key)
    )
    return [_read(item) for item in items]
