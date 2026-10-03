from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select

from app.api.dependencies import (
    Limit,
    Offset,
    ReadSession,
    WriteSession,
    get_or_404,
    require_admin,
    teacher_id,
)
from app.models import Membership, Student, StudyGroup
from app.time import utcnow

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


class MembershipCreate(BaseModel):
    student_id: int
    group_id: int


@router.post("", dependencies=[Depends(require_admin)])
def add_member(data: MembershipCreate, session: WriteSession):
    get_or_404(session, Student, data.student_id)
    get_or_404(session, StudyGroup, data.group_id)
    active = session.scalar(
        select(Membership).where(
            Membership.student_id == data.student_id,
            Membership.group_id == data.group_id,
            Membership.ended_at.is_(None),
        )
    )
    if active:
        return active
    membership = Membership(
        student_id=data.student_id, group_id=data.group_id, started_at=utcnow().date()
    )
    session.add(membership)
    session.flush()
    session.refresh(membership)
    return membership


@router.delete("/{membership_id}", dependencies=[Depends(require_admin)])
def remove_member(membership_id: int, session: WriteSession):
    membership = get_or_404(session, Membership, membership_id)
    # The row is closed, not deleted: results of past exams stay attached to the student.
    if membership.ended_at is None:
        membership.ended_at = max(utcnow().date(), membership.started_at)
    return membership
