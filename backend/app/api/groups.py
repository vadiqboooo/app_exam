from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select

from app.api.dependencies import Limit, Offset, ReadSession, WriteSession, get_or_404, teacher_id
from app.importers.group_details import group_details
from app.models import Exam, GroupCoverage, Staff, StudyGroup
from app.services.scoring import effective_structure

router = APIRouter(prefix="/groups", tags=["groups"])


class CoverageWrite(BaseModel):
    task_codes: list[str]


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
    rows = list(session.execute(query.order_by(StudyGroup.id).limit(limit).offset(offset)))
    coverage: dict[int, list[dict]] = {}
    for item in session.scalars(
        select(GroupCoverage).where(GroupCoverage.group_id.in_([group.id for group, _ in rows]))
    ):
        coverage.setdefault(item.group_id, []).append(
            {"exam_id": item.exam_id, "task_codes": item.task_codes}
        )
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
                "coverage": coverage.get(group.id, []),
            }
        )
    return result


@router.put("/{group_id}/coverage/{exam_id}")
def save_coverage(
    group_id: int,
    exam_id: int,
    data: CoverageWrite,
    session: WriteSession,
    current_teacher_id: int | None = Depends(teacher_id),
):
    """Marks the tasks of an exam the group has covered; the teacher of the group or an admin."""
    group = get_or_404(session, StudyGroup, group_id)
    if current_teacher_id is not None and group.teacher_id != current_teacher_id:
        raise HTTPException(403, "Это не ваша группа")
    exam = get_or_404(session, Exam, exam_id)
    known = [task["code"] for task in (effective_structure(session, exam) or {}).get("tasks", [])]
    unknown = sorted(set(data.task_codes) - set(known))
    if unknown:
        raise ValueError(f"В пробнике нет заданий: {', '.join(unknown)}")
    codes = [code for code in known if code in set(data.task_codes)]
    session.execute(
        delete(GroupCoverage).where(
            GroupCoverage.group_id == group.id, GroupCoverage.exam_id == exam.id
        )
    )
    if codes:
        session.add(GroupCoverage(group_id=group.id, exam_id=exam.id, task_codes=codes))
    session.flush()
    return {"exam_id": exam.id, "task_codes": codes}
