from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.api.dependencies import Limit, Offset, ReadSession, teacher_id
from app.importers.group_details import group_details
from app.models import Staff, StudyGroup

router = APIRouter(prefix="/groups", tags=["groups"])


@router.get("")
def list_groups(
    session: ReadSession,
    limit: Limit = 100,
    offset: Offset = 0,
    current_teacher_id: int | None = Depends(teacher_id),
):
    query = select(StudyGroup, Staff.name).outerjoin(Staff, StudyGroup.teacher_id == Staff.id)
    if current_teacher_id is not None:
        query = query.where(StudyGroup.teacher_id == current_teacher_id)
    rows = session.execute(query.order_by(StudyGroup.id).limit(limit).offset(offset))
    result = []
    for group, teacher_name in rows:
        details = group_details(group.source_name)
        result.append(
            {
                **details,
                "id": group.id,
                "source_name": group.source_name,
                "subject": group.subject or details["subject"],
                "exam_format": group.exam_format or details["exam_format"],
                "teacher_id": group.teacher_id,
                "teacher_name": teacher_name,
                "is_active": group.is_active,
            }
        )
    return result
