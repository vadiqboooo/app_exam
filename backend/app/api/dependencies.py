import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import transaction
from app.services.student_session import read_token

bearer = HTTPBearer(auto_error=False)


def require_operator(
    request: Request, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]
):
    key = request.app.state.settings.api_key
    if not key:
        raise HTTPException(503, "Настройте API_KEY для доступа к API")
    token = credentials.credentials if credentials else ""
    if secrets.compare_digest(token.encode(), key.encode()):
        request.state.teacher_id = None
        return
    try:
        request.state.teacher_id = read_token(token, key, "teacher")
    except ValueError as error:
        raise HTTPException(401, str(error), headers={"WWW-Authenticate": "Bearer"}) from error


def teacher_id(request: Request) -> int | None:
    return getattr(request.state, "teacher_id", None)


def require_admin(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
):
    key = request.app.state.settings.api_key
    token = credentials.credentials if credentials else ""
    if not key or not secrets.compare_digest(token.encode(), key.encode()):
        raise HTTPException(403, "Действие доступно только сотруднику")


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
