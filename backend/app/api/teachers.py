from datetime import UTC

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.api.dependencies import Limit, Offset, ReadSession, WriteSession, require_admin
from app.importers.record import normalize_name
from app.models import Staff, StudyGroup
from app.schemas.teacher_portal import TeacherWrite
from app.services.access_code import reset_code, unlock

router = APIRouter(
    prefix="/teachers",
    tags=["teachers"],
    dependencies=[Depends(require_admin)],
)


def _parts(name: str) -> tuple[str, str]:
    parts = name.split(maxsplit=1)
    return parts[0], parts[1] if len(parts) > 1 else ""


def _utc(value):
    return value.replace(tzinfo=UTC) if value is not None else None


def _read(teacher: Staff, group_ids: list[int]) -> dict:
    first_name, middle_name = _parts(teacher.name)
    return {
        "id": teacher.id,
        "name": teacher.name,
        "first_name": first_name,
        "middle_name": middle_name,
        "group_ids": group_ids,
        "has_code": teacher.has_code,
        "locked_until": _utc(teacher.locked_until),
        "last_login_at": _utc(teacher.last_login_at),
    }


def _teacher_name(data: TeacherWrite) -> tuple[str, str]:
    name = " ".join(f"{data.first_name} {data.middle_name}".split())
    return name, normalize_name(name)


def _ensure_unique(session, name_key: str, teacher_id: int | None = None) -> None:
    duplicate = next(
        (
            teacher
            for teacher in session.scalars(select(Staff).where(Staff.role == "teacher"))
            if teacher.id != teacher_id and normalize_name(teacher.name) == name_key
        ),
        None,
    )
    if duplicate is not None:
        raise ValueError("Учитель с таким именем и отчеством уже существует")


def _groups(session, group_ids: list[int]) -> list[StudyGroup]:
    groups = list(session.scalars(select(StudyGroup).where(StudyGroup.id.in_(group_ids))))
    if len(groups) != len(group_ids):
        raise ValueError("Одна или несколько групп не найдены")
    return groups


def _assign_groups(session, teacher: Staff, groups: list[StudyGroup]) -> None:
    selected_ids = {group.id for group in groups}
    for group in session.scalars(select(StudyGroup).where(StudyGroup.teacher_id == teacher.id)):
        if group.id not in selected_ids:
            group.teacher_id = None
    for group in groups:
        group.teacher_id = teacher.id


@router.get("")
def list_teachers(session: ReadSession, limit: Limit = 100, offset: Offset = 0):
    teachers = list(
        session.scalars(
            select(Staff)
            .where(Staff.role == "teacher")
            .order_by(Staff.name, Staff.id)
            .limit(limit)
            .offset(offset)
        )
    )
    group_ids = {
        teacher.id: list(
            session.scalars(
                select(StudyGroup.id)
                .where(StudyGroup.teacher_id == teacher.id)
                .order_by(StudyGroup.id)
            )
        )
        for teacher in teachers
    }
    return [_read(teacher, group_ids[teacher.id]) for teacher in teachers]


@router.post("", status_code=201)
def create_teacher(data: TeacherWrite, session: WriteSession):
    name, name_key = _teacher_name(data)
    _ensure_unique(session, name_key)
    groups = _groups(session, data.group_ids)
    teacher = Staff(
        name=name,
        login=f"teacher:{name_key}",
        password_hash="",
        role="teacher",
    )
    session.add(teacher)
    session.flush()
    _assign_groups(session, teacher, groups)
    session.flush()
    return _read(teacher, data.group_ids)


@router.put("/{teacher_id}")
def update_teacher(teacher_id: int, data: TeacherWrite, session: WriteSession):
    teacher = session.get(Staff, teacher_id)
    if teacher is None or teacher.role != "teacher":
        raise HTTPException(404, "Учитель не найден")
    name, name_key = _teacher_name(data)
    _ensure_unique(session, name_key, teacher.id)
    groups = _groups(session, data.group_ids)
    teacher.name = name
    teacher.login = f"teacher:{name_key}"
    _assign_groups(session, teacher, groups)
    session.flush()
    return _read(teacher, data.group_ids)


@router.delete("/{teacher_id}")
def delete_teacher(teacher_id: int, session: WriteSession):
    teacher = session.get(Staff, teacher_id)
    if teacher is None or teacher.role != "teacher":
        raise HTTPException(404, "Учитель не найден")
    for group in session.scalars(select(StudyGroup).where(StudyGroup.teacher_id == teacher.id)):
        group.teacher_id = None
    session.delete(teacher)
    session.flush()
    return {"ok": True}


def _teacher(session, teacher_id: int) -> Staff:
    teacher = session.get(Staff, teacher_id)
    if teacher is None or teacher.role != "teacher":
        raise HTTPException(404, "Учитель не найден")
    return teacher


def _group_ids(session, teacher: Staff) -> list[int]:
    return list(
        session.scalars(
            select(StudyGroup.id).where(StudyGroup.teacher_id == teacher.id).order_by(StudyGroup.id)
        )
    )


@router.post("/{teacher_id}/reset-code")
def reset_teacher_code(teacher_id: int, session: WriteSession):
    teacher = _teacher(session, teacher_id)
    reset_code(teacher)
    return _read(teacher, _group_ids(session, teacher))


@router.post("/{teacher_id}/unlock")
def unlock_teacher(teacher_id: int, session: WriteSession):
    teacher = _teacher(session, teacher_id)
    unlock(teacher)
    return _read(teacher, _group_ids(session, teacher))
