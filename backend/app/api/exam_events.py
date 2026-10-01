from fastapi import APIRouter, Depends
from sqlalchemy import delete, func, select

from app.api.dependencies import WriteSession, get_or_404, require_admin
from app.importers.record import normalize_name
from app.models import Exam, ExamEvent, ExamSchool, ExamSlot, Participation, Subject
from app.schemas.exam_event import EventCreate, EventRead
from app.time import utcnow

router = APIRouter(
    prefix="/exam-events",
    tags=["exam events"],
    dependencies=[Depends(require_admin)],
)


def _naive(value):
    return value.replace(tzinfo=None) if value else None


def _subject_structure(session, subject):
    """Return an explicit structure or a snapshot of the active subject template."""
    structure = subject.structure_data.model_dump() if subject.structure_data is not None else {}
    name_key = normalize_name(subject.subject)
    setting = next(
        (
            item
            for item in session.scalars(
                select(Subject).where(
                    Subject.format == subject.format,
                    Subject.is_active.is_(True),
                )
            )
            if normalize_name(item.name) == name_key
        ),
        None,
    )
    if setting is not None:
        if not structure.get("tasks"):
            structure["tasks"] = setting.tasks
        if structure.get("primary_to_secondary_scale") is None:
            structure["primary_to_secondary_scale"] = setting.primary_to_secondary_scale
        if structure.get("grade_scale") is None:
            structure["grade_scale"] = setting.grade_scale
    if not structure.get("tasks"):
        return None
    structure.setdefault("version", 1)
    return structure


def _event_bounds(data: EventCreate):
    dates = [_naive(slot.starts_at) for school in data.schools for slot in school.slots]
    if dates:
        return min(dates), max(dates)
    fallback = _naive(data.registration_open_at) or utcnow()
    return fallback, None


def _validate_new_times(data: EventCreate, existing_slots: dict[int, ExamSlot] | None = None):
    if data.draft:
        return
    existing_slots = existing_slots or {}
    for school in data.schools:
        for slot in school.slots:
            previous = existing_slots.get(slot.id) if slot.id else None
            changed = previous is None or previous.starts_at != _naive(slot.starts_at)
            if changed and _naive(slot.starts_at) <= utcnow():
                raise ValueError("Время записи должно быть в будущем")


@router.post("", response_model=EventRead, status_code=201)
def create_event(data: EventCreate, session: WriteSession):
    _validate_new_times(data)
    event = ExamEvent(title=data.title)
    session.add(event)
    session.flush()
    schools = [
        ExamSchool(event_id=event.id, name=school.name, address=school.address)
        for school in data.schools
    ]
    session.add_all(schools)
    session.flush()
    starts_at, ends_at = _event_bounds(data)
    exam_ids = []
    for subject in data.subjects:
        exam = Exam(
            event_id=event.id,
            title=data.title,
            type="mock",
            format=subject.format,
            subject=subject.subject,
            starts_at=starts_at,
            ends_at=ends_at,
            is_active=not data.draft,
            registration_open_at=_naive(data.registration_open_at),
            registration_close_at=_naive(data.registration_close_at),
            structure_data=_subject_structure(session, subject),
        )
        session.add(exam)
        session.flush()
        exam_ids.append(exam.id)
    owner_exam_id = exam_ids[0]
    session.add_all(
        [
            ExamSlot(
                event_id=event.id,
                exam_id=owner_exam_id,
                school_id=schools[school_index].id,
                starts_at=_naive(slot.starts_at),
                capacity=slot.capacity,
            )
            for school_index, school in enumerate(data.schools)
            for slot in school.slots
        ]
    )
    session.flush()
    return {"id": event.id, "title": event.title, "exam_ids": exam_ids}


@router.put("/{event_id}", response_model=EventRead)
def update_event(event_id: int, data: EventCreate, session: WriteSession):
    event = get_or_404(session, ExamEvent, event_id)
    exams = list(session.scalars(select(Exam).where(Exam.event_id == event_id)))
    schools = list(session.scalars(select(ExamSchool).where(ExamSchool.event_id == event_id)))
    slots = list(session.scalars(select(ExamSlot).where(ExamSlot.event_id == event_id)))
    exam_by_id = {exam.id: exam for exam in exams}
    school_by_id = {school.id: school for school in schools}
    slot_by_id = {slot.id: slot for slot in slots}
    supplied_exam_ids = {subject.id for subject in data.subjects if subject.id is not None}
    supplied_school_ids = {school.id for school in data.schools if school.id is not None}
    supplied_slot_ids = {
        slot.id for school in data.schools for slot in school.slots if slot.id is not None
    }
    if (
        not supplied_exam_ids.issubset(exam_by_id)
        or not supplied_school_ids.issubset(school_by_id)
        or not supplied_slot_ids.issubset(slot_by_id)
    ):
        raise ValueError("Предмет, школа или время не относятся к этому пробнику")
    if len(supplied_exam_ids) != sum(subject.id is not None for subject in data.subjects):
        raise ValueError("Предмет в пробнике не должен повторяться")
    if len(supplied_school_ids) != sum(school.id is not None for school in data.schools):
        raise ValueError("Школа в пробнике не должна повторяться")
    if len(supplied_slot_ids) != sum(
        slot.id is not None for school in data.schools for slot in school.slots
    ):
        raise ValueError("Время в пробнике не должно повторяться")
    _validate_new_times(data, slot_by_id)

    removed_exam_ids = set(exam_by_id) - supplied_exam_ids
    removed_slot_ids = set(slot_by_id) - supplied_slot_ids
    used_exam_ids = set(
        session.scalars(
            select(Participation.exam_id).where(Participation.exam_id.in_(removed_exam_ids))
        )
    )
    if used_exam_ids:
        raise ValueError("Нельзя удалить предмет, на который уже есть записи или результаты")
    used_slot_ids = set(
        session.scalars(
            select(Participation.slot_id).where(Participation.slot_id.in_(removed_slot_ids))
        )
    )
    if used_slot_ids:
        raise ValueError("Нельзя удалить время, на которое уже записаны ученики")

    event.title = data.title
    starts_at, ends_at = _event_bounds(data)
    kept_exams = []
    for subject in data.subjects:
        exam = exam_by_id[subject.id] if subject.id is not None else Exam(event_id=event_id)
        exam.title = data.title
        exam.type = "mock"
        exam.format = subject.format
        exam.subject = subject.subject
        exam.starts_at = starts_at
        exam.ends_at = ends_at
        exam.is_active = not data.draft
        exam.registration_open_at = _naive(data.registration_open_at)
        exam.registration_close_at = _naive(data.registration_close_at)
        if subject.id is None or subject.structure_data is not None:
            exam.structure_data = _subject_structure(session, subject)
        if subject.id is None:
            session.add(exam)
        kept_exams.append(exam)
    session.flush()

    kept_schools = []
    for school_data in data.schools:
        school = (
            school_by_id[school_data.id]
            if school_data.id is not None
            else ExamSchool(event_id=event_id)
        )
        school.name = school_data.name
        school.address = school_data.address
        if school_data.id is None:
            session.add(school)
        kept_schools.append((school, school_data))
    session.flush()

    owner_exam_id = kept_exams[0].id
    for school, school_data in kept_schools:
        for slot_data in school_data.slots:
            slot = slot_by_id[slot_data.id] if slot_data.id is not None else ExamSlot()
            booked = (
                session.scalar(
                    select(func.count())
                    .select_from(Participation)
                    .where(
                        Participation.slot_id == slot.id,
                        Participation.status != "cancelled",
                    )
                )
                if slot_data.id is not None
                else 0
            )
            if slot_data.capacity < booked:
                raise ValueError(
                    f"Нельзя уменьшить количество мест до {slot_data.capacity}: записано {booked}"
                )
            slot.event_id = event_id
            slot.exam_id = owner_exam_id
            slot.school_id = school.id
            slot.starts_at = _naive(slot_data.starts_at)
            slot.capacity = slot_data.capacity
            if slot_data.id is None:
                session.add(slot)

    if removed_slot_ids:
        session.execute(delete(ExamSlot).where(ExamSlot.id.in_(removed_slot_ids)))
    removed_school_ids = set(school_by_id) - supplied_school_ids
    if removed_school_ids:
        session.execute(delete(ExamSchool).where(ExamSchool.id.in_(removed_school_ids)))
    if removed_exam_ids:
        session.execute(delete(Exam).where(Exam.id.in_(removed_exam_ids)))
    session.flush()
    return {"id": event.id, "title": event.title, "exam_ids": [exam.id for exam in kept_exams]}


@router.delete("/{event_id}")
def delete_event(event_id: int, session: WriteSession):
    event = get_or_404(session, ExamEvent, event_id)
    exam_ids = select(Exam.id).where(Exam.event_id == event_id)
    slot_ids = select(ExamSlot.id).where(ExamSlot.event_id == event_id)
    session.execute(delete(Participation).where(Participation.exam_id.in_(exam_ids)))
    session.execute(delete(ExamSlot).where(ExamSlot.id.in_(slot_ids)))
    session.execute(delete(Exam).where(Exam.event_id == event_id))
    session.execute(delete(ExamSchool).where(ExamSchool.event_id == event_id))
    session.delete(event)
    session.flush()
    return {"ok": True}
