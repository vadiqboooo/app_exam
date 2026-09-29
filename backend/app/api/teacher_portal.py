from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select

from app.api.dependencies import ReadSession
from app.importers.record import normalize_name
from app.models import Staff, StudyGroup
from app.schemas.teacher_portal import TeacherLogin
from app.services.student_session import issue_token

router = APIRouter(prefix="/api/teacher", tags=["teacher portal"])


@router.post("/login")
def login(data: TeacherLogin, request: Request, session: ReadSession):
    settings = request.app.state.settings
    if not settings.api_key:
        raise HTTPException(503, "Настройте API_KEY для входа учителей")
    name_key = normalize_name(f"{data.first_name} {data.middle_name}")
    matches = [
        teacher
        for teacher in session.scalars(select(Staff).where(Staff.role == "teacher"))
        if normalize_name(teacher.name) == name_key
    ]
    if len(matches) != 1:
        raise HTTPException(
            422,
            "Учитель не найден или имя и отчество неоднозначны. Проверьте данные в CRM",
        )
    teacher = matches[0]
    has_groups = session.scalar(
        select(StudyGroup.id).where(
            StudyGroup.teacher_id == teacher.id, StudyGroup.is_active.is_(True)
        )
    )
    if has_groups is None:
        raise HTTPException(422, "У учителя нет активных групп из CRM")
    return {
        "token": issue_token(teacher.id, settings.api_key, "teacher"),
        "teacher": {"id": teacher.id, "name": teacher.name},
    }
