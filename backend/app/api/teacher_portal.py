from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select

from app.api.dependencies import WriteSession
from app.importers.record import normalize_name
from app.models import Staff, StudyGroup
from app.schemas.teacher_portal import TeacherCodeLogin
from app.services.access_code import Rejected, authenticate
from app.services.student_session import issue_token

router = APIRouter(prefix="/api/teacher", tags=["teacher portal"])


@router.post("/login")
def login(data: TeacherCodeLogin, request: Request, session: WriteSession):
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
    result = authenticate(teacher, data.code)
    if isinstance(result, Rejected):
        # Ответ без исключения: иначе транзакция откатится и счётчик попыток потеряется.
        return JSONResponse({"detail": result.detail}, status_code=result.status)
    if result != "ok":
        return {"status": result}
    return {
        "status": "ok",
        "token": issue_token(teacher.id, settings.api_key, "teacher"),
        "teacher": {"id": teacher.id, "name": teacher.name},
    }
