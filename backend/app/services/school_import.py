"""Steps of the school import wizard: teachers, groups, students and the previous version.

Per-step previews only read the database. ``run_import`` previews (rolled back) or applies
every uploaded file in one transaction, in the order the wizard shows them.
"""

import hashlib
import json
from collections import Counter, defaultdict
from datetime import date

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.importers.record import StudentRecord, normalize_name
from app.importers.school import GroupRecord, LegacyData, TeacherRecord
from app.models import (
    Exam,
    ExamEvent,
    Membership,
    Participation,
    Staff,
    Student,
    StudyGroup,
)
from app.services.scoring import calculate_final_score, effective_structure
from app.services.sync import _synchronize
from app.time import utcnow

PREVIEW_ROWS = 50
LEGACY_AUTHOR = "Прошлая версия"

# Codes of the previous app version -> (subject name, format) of the subject settings.
SUBJECT_CODES: dict[str, tuple[str, str]] = {
    "rus": ("Русский язык", "ege"),
    "math_profile": ("Математика (профильная)", "ege"),
    "math_base": ("Математика (базовая)", "ege"),
    "phys": ("Физика", "ege"),
    "infa": ("Информатика", "ege"),
    "chem": ("Химия", "ege"),
    "bio": ("Биология", "ege"),
    "hist": ("История", "ege"),
    "soc": ("Обществознание", "ege"),
    "eng": ("Английский язык", "ege"),
    "math_9": ("Математика", "oge"),
    "rus_9": ("Русский язык", "oge"),
    "infa_9": ("Информатика", "oge"),
    "soc_9": ("Обществознание", "oge"),
    "hist_9": ("История", "oge"),
    "phys_9": ("Физика", "oge"),
    "bio_9": ("Биология", "oge"),
    "geo_9": ("География", "oge"),
    "eng_9": ("Английский язык", "oge"),
    "chem_9": ("Химия", "oge"),
}


def _tokens(name: str) -> list[str]:
    return [token.strip(".") for token in normalize_name(name).replace(".", ". ").split()]


def same_person(left: str, right: str) -> bool:
    """«Екатерина С.» is the same person as «Екатерина Сергеевна»."""
    a, b = _tokens(left), _tokens(right)
    if not a or not b:
        return False
    if a == b:
        return True
    size = min(len(a), len(b))
    return size >= 2 and all(
        x.startswith(y) or y.startswith(x) for x, y in zip(a[:size], b[:size], strict=True)
    )


def count_ru(n: int, one: str, few: str, many: str) -> str:
    m, h = n % 10, n % 100
    word = one if m == 1 and h != 11 else few if 2 <= m <= 4 and not 12 <= h <= 14 else many
    return f"{n} {word}"


def _teachers(session: Session) -> list[Staff]:
    return list(session.scalars(select(Staff).where(Staff.is_teacher.is_(True))))


def teachers_preview(
    session: Session, records: list[TeacherRecord], groups: list[GroupRecord] | None = None
) -> dict:
    existing = _teachers(session)
    db_groups = list(session.scalars(select(StudyGroup)))
    rows = []
    for record in records:
        found = next((t for t in existing if same_person(record.name, t.name)), None)
        if groups is not None:
            group_count = sum(
                bool(g.teacher and same_person(g.teacher, record.name)) for g in groups
            )
        else:
            group_count = sum(found is not None and g.teacher_id == found.id for g in db_groups)
        rows.append(
            {
                "name": record.name,
                "subjects": ", ".join(record.subjects) or "—",
                "groups": group_count,
                "status": "unchanged" if found else "new",
            }
        )
    rows.sort(key=lambda row: row["status"] != "new")
    return {
        "total": len(records),
        "new": sum(row["status"] == "new" for row in rows),
        "unchanged": sum(row["status"] == "unchanged" for row in rows),
        "rows": rows[:PREVIEW_ROWS],
    }


def groups_preview(
    session: Session, records: list[GroupRecord], teachers: list[TeacherRecord] | None = None
) -> dict:
    people = [t.name for t in _teachers(session)] + [t.name for t in teachers or []]
    existing = set(session.scalars(select(StudyGroup.source_name)))
    rows = []
    for record in records:
        found = bool(record.teacher) and any(same_person(record.teacher, p) for p in people)
        status = (
            "no_teacher" if not found else "new" if record.name not in existing else "unchanged"
        )
        kind = {"ege": "ЕГЭ", "oge": "ОГЭ"}.get(record.exam_format or "")
        rows.append(
            {
                "name": record.name,
                "subject": " · ".join(part for part in (record.subject, kind) if part) or "—",
                "teacher": record.teacher
                if found or not record.teacher
                else f"«{record.teacher}» — нет в списке",
                "status": status,
            }
        )
    rows.sort(key=lambda row: row["status"] == "unchanged")
    return {
        "total": len(records),
        "new": sum(record.name not in existing for record in records),
        "with_teacher": sum(row["status"] != "no_teacher" for row in rows),
        "without_teacher": sum(row["status"] == "no_teacher" for row in rows),
        "rows": rows[:PREVIEW_ROWS],
    }


def students_preview(
    session: Session, records: list[StudentRecord], groups: list[GroupRecord] | None = None
) -> dict:
    students = list(session.scalars(select(Student)))
    by_external = {s.external_id: s for s in students if s.external_id}
    by_name = defaultdict(list)
    for student in students:
        by_name[student.name_key].append(student)
    group_names = {g.id: g.source_name for g in session.scalars(select(StudyGroup))}
    active = defaultdict(set)
    for membership in session.scalars(select(Membership).where(Membership.ended_at.is_(None))):
        active[membership.student_id].add(group_names.get(membership.group_id, ""))
    known = None if groups is None else {g.name for g in groups} | set(group_names.values())

    counts, rows, matched = Counter(), [], set()
    for record in records:
        student = by_external.get(record.external_id) if record.external_id else None
        if student is None:
            candidates = by_name[normalize_name(record.full_name)]
            student = candidates[0] if len(candidates) == 1 else None
        if student is not None:
            matched.add(student.id)
        desired = set(record.groups) if record.is_active else set()
        unknown = [g for g in desired if known is not None and g not in known]
        was = ""
        if unknown:
            status = "unknown_group"
        elif student is None:
            status = "new"
        elif student.is_active and not record.is_active:
            status = "left"
        elif not student.is_active and record.is_active:
            status = "returned"
        elif active[student.id] != desired:
            status = "changed_groups"
            was = ", ".join(sorted(active[student.id])) or "без групп"
        elif student.full_name != record.full_name or student.grade != record.grade:
            status = "updated"
        else:
            status = "unchanged"
        counts[status] += 1
        label = ", ".join(record.groups) or "—"
        if unknown:
            label = f"«{unknown[0]}» — нет в списке групп"
        elif was:
            label = f"{label} (было {was})"
        rows.append(
            {"name": record.full_name, "grade": record.grade, "groups": label, "status": status}
        )
    absent = sum(1 for s in students if s.is_active and s.id not in matched)
    rows.sort(key=lambda row: row["status"] == "unchanged")
    return {
        "total": len(records),
        "new": counts["new"],
        "returned": counts["returned"],
        "changed_groups": counts["changed_groups"],
        "left": counts["left"] + absent,
        "unknown_group": counts["unknown_group"],
        "unchanged": counts["unchanged"],
        "rows": rows[:PREVIEW_ROWS],
    }


def legacy_summary(data: LegacyData) -> dict:
    with_scores = [w for w in data.works if any(v is not None for v in w.scores)]
    return {
        "title": data.title,
        "subjects": len({w.subject_code for w in data.works if w.subject_code in SUBJECT_CODES}),
        "works": len(with_scores),
        "students": len({normalize_name(w.fio) for w in with_scores}),
    }


def _import_legacy(session: Session, data: LegacyData) -> dict:
    students = defaultdict(list)
    for student in session.scalars(select(Student)):
        students[student.name_key].append(student)
    result = {"works": len(data.works), "linked": 0, "unlinked": 0, "already": 0, "students": 0}
    prepared = []
    for work in data.works:
        subject = SUBJECT_CODES.get(work.subject_code)
        candidates = students.get(normalize_name(work.fio), [])
        if subject is None or len(candidates) != 1 or not any(v is not None for v in work.scores):
            result["unlinked"] += 1
            continue
        prepared.append((work, subject, candidates[0]))
    if not prepared:
        return result

    title = data.title or "Прошлая версия"
    event = session.scalar(select(ExamEvent).where(ExamEvent.title == title))
    if event is None:
        event = ExamEvent(title=title)
        session.add(event)
        session.flush()
    exams: dict[tuple[str, str], Exam] = {}
    linked_students: set[int] = set()
    for work, (name, exam_format), student in prepared:
        exam = exams.get((name, exam_format))
        if exam is None:
            exam = session.scalar(
                select(Exam).where(
                    Exam.event_id == event.id, Exam.subject == name, Exam.format == exam_format
                )
            )
            if exam is None:
                exam = Exam(
                    event_id=event.id,
                    format=exam_format,
                    type="mock",
                    subject=name,
                    title=title,
                    starts_at=data.created_at or utcnow(),
                    is_active=True,
                )
                session.add(exam)
                session.flush()
            exams[(name, exam_format)] = exam
        structure = effective_structure(session, exam)
        if structure is None or len(structure["tasks"]) != len(work.scores):
            result["unlinked"] += 1
            continue
        taken = session.scalar(
            select(Participation.id).where(
                Participation.student_id == student.id, Participation.exam_id == exam.id
            )
        )
        if taken is not None:
            result["already"] += 1
            continue
        tasks, total = [], 0.0
        for task, value in zip(structure["tasks"], work.scores, strict=True):
            score = min(max(value or 0.0, 0.0), float(task["max_score"]))
            tasks.append({"code": task["code"], "score": score, "comment": ""})
            total += score
        try:
            test_score = calculate_final_score(exam_format, total, structure)
        except ValueError:
            test_score = None
        session.add(
            Participation(
                student_id=student.id,
                exam_id=exam.id,
                status="checked",
                primary_score=total,
                test_score=test_score,
                result_data={"version": 1, "tasks": tasks, "overall_comment": work.comment},
                checked_by=LEGACY_AUTHOR,
            )
        )
        session.flush()
        result["linked"] += 1
        linked_students.add(student.id)
    result["students"] = len(linked_students)
    return result


def _token(session: Session, parts: dict) -> str:
    state = {}
    for model in (Student, Staff, StudyGroup, Membership, ExamEvent, Exam, Participation):
        state[model.__tablename__] = [
            list(row) for row in session.execute(select(model.__table__).order_by(model.id))
        ]
    payload = {"state": state, **parts}
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, default=str, ensure_ascii=False).encode()
    ).hexdigest()


def _apply(
    session: Session,
    *,
    teachers: list[TeacherRecord] | None,
    groups: list[GroupRecord] | None,
    students: list[StudentRecord] | None,
    legacy: LegacyData | None,
    today: date,
) -> dict:
    summary: dict = {"teachers": None, "groups": None, "students": None, "legacy": None}
    warnings: list[dict] = []

    if teachers is not None:
        existing = _teachers(session)
        created = 0
        for record in teachers:
            if any(same_person(record.name, t.name) for t in existing):
                continue
            teacher = Staff(
                name=record.name,
                login=f"teacher:{normalize_name(record.name)}",
                password_hash="",
                role="teacher",
            )
            session.add(teacher)
            session.flush()
            existing.append(teacher)
            created += 1
        summary["teachers"] = {"total": len(teachers), "new": created}

    known_groups = None
    if groups is not None:
        people = _teachers(session)
        by_name = {g.source_name: g for g in session.scalars(select(StudyGroup))}
        created, lonely = 0, []
        for record in groups:
            teacher = next(
                (p for p in people if record.teacher and same_person(record.teacher, p.name)), None
            )
            group = by_name.get(record.name)
            if group is None:
                group = StudyGroup(
                    source_name=record.name,
                    subject=record.subject,
                    exam_format=record.exam_format,
                    teacher_id=teacher.id if teacher else None,
                )
                session.add(group)
                created += 1
            else:
                group.subject = group.subject or record.subject
                group.exam_format = group.exam_format or record.exam_format
                if group.teacher_id is None and teacher is not None:
                    group.teacher_id = teacher.id
            if teacher is None and group.teacher_id is None:
                lonely.append(record)
        session.flush()
        known_groups = {g.name for g in groups}
        summary["groups"] = {"total": len(groups), "new": created, "without_teacher": len(lonely)}
        if lonely:
            first = lonely[0]
            reason = (
                f" — в файле указан «{first.teacher}», его нет в списке учителей"
                if first.teacher
                else ""
            )
            warnings.append(
                {
                    "n": count_ru(len(lonely), "группа", "группы", "групп"),
                    "text": f"без учителя: «{first.name}»{reason}"
                    + (f" и ещё {len(lonely) - 1}" if len(lonely) > 1 else "")
                    + ". Группа создастся, учителя можно назначить позже.",
                }
            )

    if students is not None:
        report = _synchronize(session, students, today, None, known_groups)
        session.flush()
        summary["students"] = {k: v for k, v in report.__dict__.items() if k != "changes"}
        if report.unknown_groups:
            example = report.changes["unknown_groups"][0]["after"][0]
            warnings.append(
                {
                    "n": count_ru(report.unknown_groups, "ученик", "ученика", "учеников"),
                    "text": f"с неизвестной группой (например, «{example}»). "
                    "Ученики добавятся, но без этой группы.",
                }
            )

    if legacy is not None:
        result = _import_legacy(session, legacy)
        summary["legacy"] = result
        if result["unlinked"] or result["already"]:
            parts = []
            if result["unlinked"]:
                parts.append(
                    "не привязаны: ученика с таким ФИО нет в списке, ФИО повторяется или предмет "
                    "не распознан"
                )
            if result["already"]:
                parts.append(f"{result['already']} уже были загружены раньше")
            warnings.append(
                {
                    "n": count_ru(
                        result["unlinked"] or result["already"], "работа", "работы", "работ"
                    ),
                    "text": "из прошлой версии " + "; ".join(parts) + ".",
                }
            )
    return {"report": summary, "warnings": warnings}


def run_import(
    session: Session,
    *,
    teachers: list[TeacherRecord] | None = None,
    groups: list[GroupRecord] | None = None,
    students: list[StudentRecord] | None = None,
    legacy: LegacyData | None = None,
    today: date,
    hashes: dict[str, str],
    confirmation: str | None = None,
) -> dict:
    """Preview (rolled back) or apply, in the wizard's order. One transaction for all files."""
    if teachers is None and groups is None and students is None and legacy is None:
        raise ValueError("Загрузите хотя бы один файл")
    if students is not None and not students:
        raise ValueError("Пустая выгрузка учеников")
    if session.bind.dialect.name == "postgresql":
        session.execute(text("SELECT pg_advisory_xact_lock(72646102)"))
    token = _token(session, {"files": hashes, "date": today})
    if confirmation is not None and confirmation != token:
        raise ValueError("Файлы, дата или база изменились. Повторите предварительный просмотр")
    with session.begin_nested() as savepoint:
        result = _apply(
            session,
            teachers=teachers,
            groups=groups,
            students=students,
            legacy=legacy,
            today=today,
        )
        session.flush()
        if confirmation is None:
            savepoint.rollback()
    return {"confirmation": token, "applied": confirmation is not None, **result}
