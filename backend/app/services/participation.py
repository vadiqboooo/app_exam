from math import isclose

from sqlalchemy import func, select
from sqlalchemy.orm import Session, object_session

from app.models import Exam, ExamSlot, Participation, Student
from app.schemas.participation import QuickResultWrite, Registration, ResultWrite
from app.services.scoring import calculate_final_score, effective_structure
from app.time import utcnow

TRANSITIONS = {
    "registered": {"attended", "absent", "cancelled"},
    "attended": {"submitted"},
    "submitted": {"checked"},
    "checked": {"published"},
    "published": set(),
    "absent": {"registered"},
    "cancelled": {"registered"},
}


def check_slot(
    session: Session,
    student_id: int,
    exam: Exam,
    slot_id: int | None,
    participation_id: int | None = None,
) -> None:
    if exam.event_id is None:
        if slot_id is not None:
            raise ValueError("У этого экзамена нет выбора времени")
        return
    if slot_id is None:
        raise ValueError("Выберите школу, дату и время записи")
    # SQLite serializes writes with BEGIN IMMEDIATE. Row locks also protect PostgreSQL.
    session.execute(select(Student.id).where(Student.id == student_id).with_for_update())
    slot = session.scalar(select(ExamSlot).where(ExamSlot.id == slot_id).with_for_update())
    if slot is None or slot.event_id != exam.event_id:
        raise ValueError("Выбранное время не относится к этому пробнику")
    if slot.starts_at <= utcnow():
        raise ValueError("Запись на это время уже закрыта")
    active = [Participation.status != "cancelled"]
    if participation_id is not None:
        active.append(Participation.id != participation_id)
    booked = session.scalar(
        select(func.count())
        .select_from(Participation)
        .where(
            Participation.slot_id == slot.id,
            *active,
        )
    )
    if booked >= slot.capacity:
        raise ValueError("На это время свободных мест нет. Выберите другое время")
    conflict = session.scalar(
        select(Participation.id)
        .join(
            ExamSlot,
            Participation.slot_id == ExamSlot.id,
        )
        .where(
            Participation.student_id == student_id, ExamSlot.starts_at == slot.starts_at, *active
        )
    )
    if conflict is not None:
        raise ValueError("Ученик уже записан на другое испытание в это время")


def register(session: Session, data: Registration) -> Participation:
    student = session.get(Student, data.student_id)
    exam = session.get(Exam, data.exam_id)
    if not student or not exam:
        raise ValueError("Ученик или экзамен не найден")
    if not student.is_active or not exam.is_active:
        raise ValueError("Ученик и экзамен должны быть активны")
    check_slot(session, student.id, exam, data.slot_id)
    # This is an operator API: historical EGE results can be entered after the exam.
    participation = Participation(**data.model_dump())
    session.add(participation)
    session.flush()
    return participation


def change_status(item: Participation, target: str) -> None:
    if target == item.status:
        return
    if target not in TRANSITIONS[item.status]:
        raise ValueError(f"Переход {item.status} → {target} запрещён")
    if target == "checked" and item.primary_score is None:
        raise ValueError("Сначала сохраните результат проверки")
    if item.status == "cancelled" and target == "registered" and item.slot_id is not None:
        session = object_session(item)
        exam = session.get(Exam, item.exam_id)
        check_slot(session, item.student_id, exam, item.slot_id, item.id)
    item.status = target
    item.updated_at = utcnow()
    if target == "published":
        item.published_at = item.updated_at


def save_result(
    session: Session, item: Participation, data: ResultWrite, checker: str | None = None
) -> None:
    if item.status not in {"submitted", "checked"}:
        raise ValueError("Результат можно менять после сдачи работы и до публикации")
    exam = session.get(Exam, item.exam_id)
    structure = effective_structure(session, exam)
    if structure:
        maxima = {t["code"]: t["max_score"] for t in structure["tasks"]}
        if data.primary_score > sum(maxima.values()):
            raise ValueError("Первичный балл превышает максимум экзамена")
    if data.result_data is not None:
        if structure is None:
            raise ValueError("Для баллов по заданиям нужна структура экзамена")
        tasks = data.result_data.tasks
        if {t.code for t in tasks} != set(maxima):
            raise ValueError("Результат должен содержать все задания из структуры экзамена")
        if any(t.score > maxima[t.code] for t in tasks):
            raise ValueError("Балл за задание превышает максимум")
        if not isclose(sum(t.score for t in tasks), data.primary_score, abs_tol=1e-8):
            raise ValueError("Первичный балл не совпадает с суммой баллов за задания")
    automatic_score = (
        calculate_final_score(exam.format, data.primary_score, structure)
        if structure is not None and exam.format in {"ege", "oge"}
        else None
    )
    test_score = automatic_score if automatic_score is not None else data.test_score
    result_data = data.result_data.model_dump() if data.result_data is not None else None
    changed = (
        item.primary_score != data.primary_score
        or item.test_score != test_score
        or item.result_data != result_data
    )
    item.primary_score = data.primary_score
    item.test_score = test_score
    item.result_data = result_data
    # Publishing re-sends saved scores: it must not take over the original checker.
    if checker and (changed or item.checked_by is None):
        item.checked_by = checker
    item.updated_at = utcnow()


def quick_save_result(
    session: Session, data: QuickResultWrite, checker: str | None = None
) -> Participation:
    """Create or update a checked work from the compact result-entry screen.

    Registrations remain the source of truth, but an operator does not have to click
    through ``attended`` and ``submitted`` before entering a historical result.
    """
    student = session.get(Student, data.student_id)
    exam = session.get(Exam, data.exam_id)
    if not student or not exam:
        raise ValueError("Ученик или экзамен не найден")
    if not student.is_active or not exam.is_active:
        raise ValueError("Ученик и экзамен должны быть активны")

    item = session.scalar(
        select(Participation).where(
            Participation.student_id == data.student_id,
            Participation.exam_id == data.exam_id,
        )
    )
    if item is not None and item.status == "published":
        raise ValueError("Опубликованный результат нельзя изменить")

    slot_id = item.slot_id if item is not None and data.slot_id is None else data.slot_id
    if exam.event_id is not None:
        if slot_id is not None:
            slot = session.get(ExamSlot, slot_id)
            if slot is None or slot.event_id != exam.event_id:
                raise ValueError("Выбранное время не относится к этому пробнику")
            if slot.starts_at > utcnow() and (item is None or item.slot_id != slot_id):
                check_slot(
                    session,
                    student.id,
                    exam,
                    slot_id,
                    item.id if item is not None else None,
                )
    elif slot_id is not None:
        raise ValueError("У этого экзамена нет выбора времени")

    if item is None:
        item = Participation(
            student_id=data.student_id,
            exam_id=data.exam_id,
            slot_id=slot_id,
            status="submitted",
        )
        session.add(item)
        session.flush()
    else:
        if item.status in {"absent", "cancelled"}:
            raise ValueError("Сначала восстановите запись ученика на экзамен")
        item.slot_id = slot_id
        if item.status == "registered":
            change_status(item, "attended")
        if item.status == "attended":
            change_status(item, "submitted")

    result = ResultWrite(
        primary_score=data.primary_score,
        test_score=data.test_score,
        result_data=data.result_data,
    )
    save_result(session, item, result, checker)
    if item.status == "submitted":
        change_status(item, "checked")
    session.flush()
    return item
