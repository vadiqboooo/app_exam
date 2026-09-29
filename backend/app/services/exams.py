from collections import defaultdict

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Exam, ExamSchool, ExamSlot, Participation
from app.schemas.exam import ExamRead, SlotRead, Structure
from app.services.scoring import effective_structure


def read_exams(session: Session, exams: list[Exam]) -> list[ExamRead]:
    if not exams:
        return []
    counts = (
        select(Participation.slot_id, func.count().label("booked"))
        .where(Participation.status != "cancelled")
        .group_by(Participation.slot_id)
        .subquery()
    )
    rows = session.execute(
        select(ExamSlot, ExamSchool, func.coalesce(counts.c.booked, 0))
        .join(ExamSchool, ExamSchool.id == ExamSlot.school_id)
        .outerjoin(counts, counts.c.slot_id == ExamSlot.id)
        .where(ExamSlot.event_id.in_([e.event_id for e in exams if e.event_id is not None]))
        .order_by(ExamSlot.starts_at, ExamSchool.name, ExamSlot.id)
    )
    event_slots = defaultdict(list)
    for slot, school, booked in rows:
        event_slots[slot.event_id].append(
            SlotRead(
                id=slot.id,
                school_id=school.id,
                school_name=school.name,
                school_address=school.address,
                starts_at=slot.starts_at,
                capacity=slot.capacity,
                booked=booked,
                remaining=max(0, slot.capacity - booked),
            )
        )
    return [
        ExamRead.model_validate(e).model_copy(
            update={
                "slots": event_slots[e.event_id],
                "structure_data": (
                    Structure.model_validate(structure)
                    if (structure := effective_structure(session, e)) is not None
                    else None
                ),
            }
        )
        for e in exams
    ]
