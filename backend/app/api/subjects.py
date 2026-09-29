from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.api.dependencies import Limit, Offset, ReadSession, WriteSession, require_admin
from app.importers.record import normalize_name
from app.models import Subject
from app.schemas.subject import SubjectRead, SubjectWrite

router = APIRouter(prefix="/subjects", tags=["subjects"])


def _read(subject: Subject) -> dict:
    return {
        "id": subject.id,
        "name": subject.name,
        "format": subject.format,
        "tasks": subject.tasks,
        "primary_to_secondary_scale": subject.primary_to_secondary_scale,
        "grade_scale": subject.grade_scale,
        "is_active": subject.is_active,
        "max_primary_score": sum(task["max_score"] for task in subject.tasks),
    }


def _ensure_unique(session, data: SubjectWrite, subject_id: int | None = None) -> None:
    key = normalize_name(data.name)
    duplicate = next(
        (
            subject
            for subject in session.scalars(select(Subject).where(Subject.format == data.format))
            if subject.id != subject_id and normalize_name(subject.name) == key
        ),
        None,
    )
    if duplicate is not None:
        exam_name = "ЕГЭ" if data.format == "ege" else "ОГЭ"
        raise ValueError(f"Настройки {data.name} · {exam_name} уже существуют")


@router.get("", response_model=list[SubjectRead])
def list_subjects(session: ReadSession, limit: Limit = 100, offset: Offset = 0):
    subjects = session.scalars(
        select(Subject).order_by(Subject.name, Subject.format).limit(limit).offset(offset)
    )
    return [_read(subject) for subject in subjects]


@router.post(
    "",
    response_model=SubjectRead,
    status_code=201,
    dependencies=[Depends(require_admin)],
)
def create_subject(data: SubjectWrite, session: WriteSession):
    _ensure_unique(session, data)
    subject = Subject(**data.model_dump(mode="json"))
    session.add(subject)
    session.flush()
    return _read(subject)


@router.put(
    "/{subject_id}",
    response_model=SubjectRead,
    dependencies=[Depends(require_admin)],
)
def update_subject(subject_id: int, data: SubjectWrite, session: WriteSession):
    subject = session.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(404, "Настройки предмета не найдены")
    _ensure_unique(session, data, subject.id)
    for key, value in data.model_dump(mode="json").items():
        setattr(subject, key, value)
    session.flush()
    return _read(subject)


@router.delete("/{subject_id}", dependencies=[Depends(require_admin)])
def delete_subject(subject_id: int, session: WriteSession):
    subject = session.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(404, "Настройки предмета не найдены")
    session.delete(subject)
    session.flush()
    return {"ok": True}
