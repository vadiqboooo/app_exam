import hashlib
import json
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import date

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.importers.group_details import group_details
from app.importers.record import StudentRecord, normalize_name
from app.models import Membership, Staff, Student, StudyGroup


@dataclass
class SyncReport:
    total: int = 0
    unchanged: int = 0
    new: int = 0
    returned: int = 0
    left: int = 0
    updated: int = 0
    changed_groups: int = 0
    new_groups: int = 0
    new_teachers: int = 0
    memberships_added: int = 0
    memberships_closed: int = 0
    changes: dict = field(default_factory=lambda: defaultdict(list))


def fingerprint(
    session: Session,
    records: list[StudentRecord],
    today: date,
    selected_grades: set[int | None] | None,
) -> str:
    state = {}
    for model in (Student, Staff, StudyGroup, Membership):
        state[model.__tablename__] = [
            list(row) for row in session.execute(select(model.__table__).order_by(model.id))
        ]
    payload = {
        "state": state,
        "records": [r.model_dump() for r in records],
        "date": today,
        "grades": sorted(selected_grades, key=lambda g: g or 0)
        if selected_grades is not None
        else None,
    }
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, default=str, ensure_ascii=False).encode()
    ).hexdigest()


def sync_students(
    session: Session,
    records: list[StudentRecord],
    *,
    today: date,
    confirmation: str | None = None,
    allow_empty: bool = False,
    selected_grades: set[int | None] | None = None,
) -> dict:
    """Preview rolls back a savepoint; apply is committed by the caller's transaction.

    The input is a FULL CRM snapshot. SQLite callers must use transaction(write=True).
    A grade selection limits writes, but identities are matched against the full file
    so pupils moving into an unselected grade are not treated as missing.
    """
    if not records and not allow_empty:
        raise ValueError("Пустая выгрузка: для архивации всех учеников нужен allow_empty=true")
    if selected_grades is not None and not any(r.grade in selected_grades for r in records):
        raise ValueError("Выберите хотя бы один класс с учениками в файле")
    if session.bind.dialect.name == "postgresql":
        session.execute(text("SELECT pg_advisory_xact_lock(72646101)"))
    token = fingerprint(session, records, today, selected_grades)
    if confirmation is not None and confirmation != token:
        raise ValueError(
            "Файл, классы, дата или база изменились. Повторите предварительный просмотр"
        )
    with session.begin_nested() as savepoint:
        report = _synchronize(session, records, today, selected_grades)
        session.flush()
        if confirmation is None:
            savepoint.rollback()
    counts = asdict(report)
    changes = counts.pop("changes")
    return {
        "confirmation": token,
        "report": counts,
        "changes": changes,
        "applied": confirmation is not None,
    }


def _synchronize(
    session: Session,
    records: list[StudentRecord],
    today: date,
    selected_grades: set[int | None] | None,
) -> SyncReport:
    report = SyncReport(
        total=sum(selected_grades is None or r.grade in selected_grades for r in records)
    )
    students = list(session.scalars(select(Student)))
    by_external = {s.external_id: s for s in students if s.external_id is not None}
    by_name = defaultdict(list)
    for student in students:
        by_name[student.name_key].append(student)
    groups = {g.source_name: g for g in session.scalars(select(StudyGroup))}
    teachers = {
        normalize_name(teacher.name): teacher
        for teacher in session.scalars(select(Staff).where(Staff.role == "teacher"))
    }
    active = defaultdict(dict)
    for membership in session.scalars(select(Membership).where(Membership.ended_at.is_(None))):
        active[membership.student_id][membership.group_id] = membership

    # Resolve every identity before mutating: ambiguous names never merge histories.
    matched = []
    seen_students, seen_keys = set(), set()
    for record in records:
        key = normalize_name(record.full_name)
        identity = ("id", record.external_id) if record.external_id else ("name", key)
        if identity in seen_keys:
            raise ValueError(f"Повтор ученика в выгрузке: {record.full_name}")
        seen_keys.add(identity)
        student = by_external.get(record.external_id)
        if student is None:
            candidates = by_name[key]
            if record.external_id:
                candidates = [s for s in candidates if s.external_id is None]
            if len(candidates) > 1:
                raise ValueError(f"Неоднозначное ФИО: {record.full_name}; нужен постоянный ID")
            student = candidates[0] if candidates else None
        if student is not None:
            if student.id in seen_students:
                raise ValueError(f"Несколько строк соответствуют ученику: {record.full_name}")
            seen_students.add(student.id)
        matched.append((record, student, key))
    names_without_ids = {key for record, _, key in matched if not record.external_id}
    for key in names_without_ids:
        if sum(name == key for _, _, name in matched) > 1:
            raise ValueError(f"Одинаковые ФИО без постоянных ID: {key}")

    for record, student, key in matched:
        if selected_grades is not None and record.grade not in selected_grades:
            continue
        is_new = student is None
        if is_new:
            student = Student(
                full_name=record.full_name,
                name_key=key,
                external_id=record.external_id,
                grade=record.grade,
                is_active=record.is_active,
            )
            session.add(student)
            session.flush()
            report.new += 1
            report.changes["new"].append({"full_name": record.full_name})
        desired = set()
        for name in record.groups if record.is_active else ():
            details = group_details(name)
            group = groups.get(name)
            teacher = None
            teacher_name = details["teacher_name"]
            if teacher_name and (group is None or group.teacher_id is None):
                teacher_key = normalize_name(teacher_name)
                teacher = teachers.get(teacher_key)
                if teacher is None:
                    teacher = Staff(
                        name=teacher_name,
                        login=f"teacher:{teacher_key}",
                        password_hash="",
                        role="teacher",
                    )
                    session.add(teacher)
                    session.flush()
                    teachers[teacher_key] = teacher
                    report.new_teachers += 1
                    report.changes["new_teachers"].append({"full_name": teacher_name})
            if group is None:
                group = StudyGroup(
                    source_name=name,
                    subject=details["subject"],
                    exam_format=details["exam_format"],
                    teacher_id=teacher.id if teacher else None,
                )
                session.add(group)
                session.flush()
                groups[name] = group
                report.new_groups += 1
                report.changes["new_groups"].append({"full_name": name})
            else:
                if group.subject is None:
                    group.subject = details["subject"]
                if group.exam_format is None:
                    group.exam_format = details["exam_format"]
                if group.teacher_id is None and teacher is not None:
                    group.teacher_id = teacher.id
            desired.add(group.id)
        current = active[student.id]
        changed = (
            student.full_name != record.full_name
            or student.grade != record.grade
            or student.is_active != record.is_active
            or (record.external_id is not None and student.external_id != record.external_id)
        )
        if not is_new:
            if not student.is_active and record.is_active:
                report.returned += 1
                report.changes["returned"].append({"full_name": record.full_name})
            elif student.is_active and not record.is_active:
                report.left += 1
                report.changes["left"].append({"full_name": record.full_name})
            elif changed or set(current) != desired:
                report.updated += 1
                report.changes["updated"].append({"full_name": record.full_name})
            else:
                report.unchanged += 1
                report.changes["unchanged"].append({"full_name": record.full_name})
            report.changed_groups += int(set(current) != desired)
            if set(current) != desired:
                names = {g.id: g.source_name for g in groups.values()}
                report.changes["changed_groups"].append(
                    {
                        "full_name": record.full_name,
                        "before": sorted(names[g] for g in current),
                        "after": sorted(names[g] for g in desired),
                    }
                )
        student.full_name, student.name_key = record.full_name, key
        student.grade, student.is_active = record.grade, record.is_active
        if record.external_id is not None:
            student.external_id = record.external_id
        for group_id in set(current) - desired:
            current[group_id].ended_at = today
            report.memberships_closed += 1
        for group_id in desired - set(current):
            session.add(Membership(student_id=student.id, group_id=group_id, started_at=today))
            report.memberships_added += 1

    for student in students:
        if selected_grades is not None and student.grade not in selected_grades:
            continue
        if student.id not in seen_students:
            if student.is_active:
                report.changes["left"].append({"full_name": student.full_name})
            report.left += int(student.is_active)
            student.is_active = False
            for membership in active[student.id].values():
                membership.ended_at = today
                report.memberships_closed += 1
    session.flush()
    active_group_ids = set(
        session.scalars(select(Membership.group_id).where(Membership.ended_at.is_(None)))
    )
    for group in groups.values():
        group.is_active = group.id in active_group_ids
    return report
