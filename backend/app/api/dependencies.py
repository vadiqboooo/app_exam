import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import transaction
from app.models import Staff
from app.services.student_session import read_token

bearer = HTTPBearer(auto_error=False)


def require_operator(
    request: Request, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]
):
    """The API key means the whole school; an employee token carries the employee's roles.

    A pure teacher is limited to own groups (`teacher_id`). An employee who is also an
    administrator or responsible sees everything, but keeps `staff_id` to sign their work.
    """
    key = request.app.state.settings.api_key
    if not key:
        raise HTTPException(503, "Настройте API_KEY для доступа к API")
    token = credentials.credentials if credentials else ""
    request.state.teacher_id = request.state.staff_id = None
    request.state.is_admin = False
    if secrets.compare_digest(token.encode(), key.encode()):
        request.state.is_admin = True
        return
    try:
        employee_id = read_token(token, key, "teacher")
    except ValueError as error:
        raise HTTPException(401, str(error), headers={"WWW-Authenticate": "Bearer"}) from error
    with transaction(request.app.state.engine) as session:
        staff = session.get(Staff, employee_id)
        if staff is None:
            raise HTTPException(401, "Сотрудник удалён. Войдите снова")
        request.state.staff_id = staff.id
        request.state.is_admin = staff.is_admin
        if not (staff.is_admin or staff.is_responsible):
            request.state.teacher_id = staff.id


def teacher_id(request: Request) -> int | None:
    return getattr(request.state, "teacher_id", None)


def staff_id(request: Request) -> int | None:
    return getattr(request.state, "staff_id", None)


def require_admin(
    request: Request,
    _operator: Annotated[None, Depends(require_operator)],
):
    if not getattr(request.state, "is_admin", False):
        raise HTTPException(403, "Действие доступно только администратору")


def read_session(request: Request):
    with transaction(request.app.state.engine) as session:
        yield session


def write_session(request: Request):
    with transaction(request.app.state.engine, write=True) as session:
        yield session


def get_or_404(session: Session, model, item_id: int):
    item = session.get(model, item_id)
    if item is None:
        raise HTTPException(404, "Запись не найдена")
    return item


ReadSession = Annotated[Session, Depends(read_session)]
WriteSession = Annotated[Session, Depends(write_session, scope="function")]
Limit = Annotated[int, Query(ge=1, le=500)]
Offset = Annotated[int, Query(ge=0)]
