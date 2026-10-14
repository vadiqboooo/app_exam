from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, select

from app.api.dependencies import (
    Limit,
    Offset,
    ReadSession,
    WriteSession,
    get_or_404,
    require_admin,
    teacher_id,
)
from app.importers.group_details import group_details
from app.models import Exam, GroupCoverage, Staff, StudyGroup
from app.schemas.base import NonEmpty, Schema
from app.services.scoring import effective_structure

router = APIRouter(prefix="/groups", tags=["groups"])


class CoverageWrite(BaseModel):
    task_codes: list[str]


class GroupWrite(Schema):
    source_name: NonEmpty
    subject: str | None = None
    exam_format: str | None = Field(default=None, pattern="^(ege|oge)$")
    teacher_id: int | None = Field(default=None, gt=0)
    is_active: bool = True

    @field_validator("subject")
    @classmethod
    def empty_subject(cls, value):
        return value or None


def _read_group(group: StudyGroup, teacher_name: str | None, coverage: list[dict]) -> dict:
    details = group_details(group.source_name)
    return {
        **details,
        "id": group.id,
        "source_name": group.source_name,
        "subject": group.subject or details["subject"],
        "exam_format": group.exam_format or details["exam_format"],
        "teacher_id": group.teacher_id,
        "teacher_name": teacher_name,
        "is_active": group.is_active,
        "coverage": coverage,
    }


@router.get("")
def list_groups(
    session: ReadSession,
    limit: Limit = 100,
    offset: Offset = 0,
    current_teacher_id: int | None = Depends(teacher_id),
):
    query = select(StudyGroup, Staff.name).outerjoin(Staff, StudyGroup.teacher_id == Staff.id)
    if current_teacher_id is not None:
        query = query.where(
            StudyGroup.teacher_id == current_teacher_id, StudyGroup.is_active.is_(True)
        )
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
        result.append(_read_group(group, teacher_name, coverage.get(group.id, [])))
    return result


@router.put("/{group_id}", dependencies=[Depends(require_admin)])
def update_group(group_id: int, data: GroupWrite, session: WriteSession):
    group = get_or_404(session, StudyGroup, group_id)
    duplicate = session.scalar(
        select(StudyGroup.id).where(
            StudyGroup.source_name == data.source_name, StudyGroup.id != group.id
        )
    )
    if duplicate is not None:
        raise ValueError("Группа с таким названием уже существует")
    teacher = session.get(Staff, data.teacher_id) if data.teacher_id is not None else None
    if data.teacher_id is not None and (
        teacher is None or not teacher.is_teacher or not teacher.is_active
    ):
        raise ValueError("Можно назначить только активного сотрудника с ролью «Учитель»")
    group.source_name = data.source_name
    group.subject = data.subject
    group.exam_format = data.exam_format
    group.teacher_id = teacher.id if teacher is not None else None
    group.is_active = data.is_active
    group.is_manually_archived = not data.is_active
    session.flush()
    coverage = [
        {"exam_id": item.exam_id, "task_codes": item.task_codes}
        for item in session.scalars(
            select(GroupCoverage).where(GroupCoverage.group_id == group.id)
        )
    ]
    return _read_group(group, teacher.name if teacher is not None else None, coverage)


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
    if current_teacher_id is not None and not group.is_active:
        raise HTTPException(404, "Группа находится в архиве")
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
