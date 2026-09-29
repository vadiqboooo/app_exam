from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.api.dependencies import Limit, Offset, ReadSession, teacher_id
from app.models import Membership, StudyGroup

router = APIRouter(prefix="/memberships", tags=["memberships"])


@router.get("")
def list_memberships(
    session: ReadSession,
    limit: Limit = 100,
    offset: Offset = 0,
    current_teacher_id: int | None = Depends(teacher_id),
):
    query = select(Membership)
    if current_teacher_id is not None:
        query = query.join(StudyGroup).where(StudyGroup.teacher_id == current_teacher_id)
    return session.scalars(query.order_by(Membership.id).limit(limit).offset(offset)).all()
