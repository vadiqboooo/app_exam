from pathlib import Path
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, Form, HTTPException, Response, UploadFile
from sqlalchemy import delete, func, select

from app.api.dependencies import (
    Limit,
    Offset,
    ReadSession,
    WriteSession,
    get_or_404,
    require_admin,
    staff_id,
    teacher_id,
)
from app.importers.record import normalize_name
from app.models import Exam, Staff, Subject, SubjectVariant, VariantEvent
from app.schemas.subject import (
    SubjectContentWrite,
    SubjectRead,
    SubjectWrite,
    VariantEvents,
    VariantRead,
    VariantRename,
)
from app.time import utcnow

router = APIRouter(prefix="/subjects", tags=["subjects"])

MAX_VARIANT_BYTES = 20 * 1024 * 1024
# extension -> (content type, signature every real file of that type starts with)
VARIANT_TYPES = {
    ".pdf": ("application/pdf", b"%PDF"),
    ".doc": ("application/msword", b"\xd0\xcf\x11\xe0"),
    ".docx": (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        b"PK\x03\x04",
    ),
}


def _reads(session, subjects: list[Subject]) -> list[dict]:
    names = {
        staff_id: name
        for staff_id, name in session.execute(
            select(Staff.id, Staff.name).where(
                Staff.id.in_({s.responsible_id for s in subjects if s.responsible_id})
            )
        )
    }
    counts = {
        subject_id: count
        for subject_id, count in session.execute(
            select(SubjectVariant.subject_id, func.count())
            .where(SubjectVariant.subject_id.in_([s.id for s in subjects]))
            .group_by(SubjectVariant.subject_id)
        )
    }
    return [
        {
            "id": subject.id,
            "name": subject.name,
            "format": subject.format,
            "tasks": subject.tasks,
            "primary_to_secondary_scale": subject.primary_to_secondary_scale,
            "grade_scale": subject.grade_scale,
            "is_active": subject.is_active,
            "duration_minutes": subject.duration_minutes,
            "responsible_id": subject.responsible_id,
            "responsible_name": names.get(subject.responsible_id),
            "responsible_since": subject.responsible_since,
            "variants_count": counts.get(subject.id, 0),
            "max_primary_score": sum(task["max_score"] for task in subject.tasks),
        }
        for subject in subjects
    ]


def _read(session, subject: Subject) -> dict:
    return _reads(session, [subject])[0]


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


def _check_responsible(session, staff_id: int | None) -> None:
    if staff_id is None:
        return
    teacher = session.get(Staff, staff_id)
    if teacher is None or not teacher.is_teacher:
        raise ValueError("Ответственным можно назначить только сотрудника с ролью «Учитель»")


def _manage(subject: Subject, current_teacher_id: int | None) -> None:
    """The administrator and the responsible teacher may change a subject."""
    if current_teacher_id is not None and subject.responsible_id != current_teacher_id:
        raise HTTPException(403, "Этот предмет вам не назначен")


@router.get("", response_model=list[SubjectRead])
def list_subjects(session: ReadSession, limit: Limit = 100, offset: Offset = 0):
    subjects = list(
        session.scalars(
            select(Subject).order_by(Subject.name, Subject.format).limit(limit).offset(offset)
        )
    )
    return _reads(session, subjects)


@router.get("/mine", response_model=list[SubjectRead])
def my_subjects(session: ReadSession, current_staff_id: int | None = Depends(staff_id)):
    if current_staff_id is None:
        return []
    subjects = list(
        session.scalars(
            select(Subject)
            .where(Subject.responsible_id == current_staff_id)
            .order_by(Subject.name, Subject.format)
        )
    )
    return _reads(session, subjects)


@router.post(
    "",
    response_model=SubjectRead,
    status_code=201,
    dependencies=[Depends(require_admin)],
)
def create_subject(data: SubjectWrite, session: WriteSession):
    _ensure_unique(session, data)
    _check_responsible(session, data.responsible_id)
    subject = Subject(**data.model_dump(mode="json"))
    if subject.responsible_id is not None:
        subject.responsible_since = utcnow()
    session.add(subject)
    session.flush()
    return _read(session, subject)


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
    # The settings are replaced as a whole, but the optional new fields keep their value when the
    # client did not send them (e.g. the active switch of the list must not drop the teacher).
    changes = data.model_dump(mode="json")
    for key in ("duration_minutes", "responsible_id"):
        if key not in data.model_fields_set:
            del changes[key]
    if "responsible_id" in changes and changes["responsible_id"] != subject.responsible_id:
        _check_responsible(session, changes["responsible_id"])
        subject.responsible_since = utcnow() if changes["responsible_id"] is not None else None
    for key, value in changes.items():
        setattr(subject, key, value)
    session.flush()
    return _read(session, subject)


@router.put("/{subject_id}/content", response_model=SubjectRead)
def update_content(
    subject_id: int,
    data: SubjectContentWrite,
    session: WriteSession,
    current_teacher_id: int | None = Depends(teacher_id),
):
    subject = get_or_404(session, Subject, subject_id)
    _manage(subject, current_teacher_id)
    dumped = data.model_dump(mode="json")
    subject.tasks = dumped["tasks"]
    subject.primary_to_secondary_scale = dumped["primary_to_secondary_scale"]
    subject.grade_scale = dumped["grade_scale"]
    session.flush()
    return _read(session, subject)


@router.delete("/{subject_id}", dependencies=[Depends(require_admin)])
def delete_subject(subject_id: int, session: WriteSession):
    subject = session.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(404, "Настройки предмета не найдены")
    variant_ids = select(SubjectVariant.id).where(SubjectVariant.subject_id == subject.id)
    session.execute(delete(VariantEvent).where(VariantEvent.variant_id.in_(variant_ids)))
    session.execute(delete(SubjectVariant).where(SubjectVariant.subject_id == subject.id))
    session.delete(subject)
    session.flush()
    return {"ok": True}


def _variant_metas(session, variants: list[SubjectVariant]) -> list[dict]:
    links: dict[int, list[int]] = {}
    for variant_id, event_id in session.execute(
        select(VariantEvent.variant_id, VariantEvent.event_id)
        .where(VariantEvent.variant_id.in_([variant.id for variant in variants]))
        .order_by(VariantEvent.event_id)
    ):
        links.setdefault(variant_id, []).append(event_id)
    return [
        {
            "id": variant.id,
            "subject_id": variant.subject_id,
            "name": variant.name,
            "filename": variant.filename,
            "content_type": variant.content_type,
            "size": variant.size,
            "uploaded_at": variant.uploaded_at,
            "event_ids": links.get(variant.id, []),
        }
        for variant in variants
    ]


def _check_events(session, subject: Subject, event_ids: list[int]) -> list[int]:
    """Only events that really include the subject may get its variants."""
    wanted = sorted(set(event_ids))
    if not wanted:
        return []
    key = normalize_name(subject.name)
    found = {
        exam.event_id
        for exam in session.scalars(
            select(Exam).where(Exam.event_id.in_(wanted), Exam.format == subject.format)
        )
        if normalize_name(exam.subject) == key
    }
    if found != set(wanted):
        raise ValueError("Один из пробников не найден или в нём нет этого предмета")
    return wanted


def _attach(session, variant: SubjectVariant, event_ids: list[int]) -> None:
    session.execute(delete(VariantEvent).where(VariantEvent.variant_id == variant.id))
    session.add_all(VariantEvent(variant_id=variant.id, event_id=event) for event in event_ids)


def _read_upload(upload: UploadFile) -> tuple[str, str, bytes]:
    filename = Path(upload.filename or "").name
    extension = Path(filename).suffix.lower()
    if extension not in VARIANT_TYPES:
        raise ValueError(f"«{filename}»: допустимы файлы PDF, DOC и DOCX")
    data = upload.file.read(MAX_VARIANT_BYTES + 1)
    if not data:
        raise ValueError(f"«{filename}»: файл пустой")
    if len(data) > MAX_VARIANT_BYTES:
        raise ValueError(f"«{filename}»: файл больше 20 МБ")
    content_type, signature = VARIANT_TYPES[extension]
    if not data.startswith(signature):
        raise ValueError(f"«{filename}»: содержимое не похоже на {extension[1:].upper()}")
    return filename, content_type, data


@router.get("/{subject_id}/variants", response_model=list[VariantRead])
def list_variants(subject_id: int, session: ReadSession):
    get_or_404(session, Subject, subject_id)
    variants = session.scalars(
        select(SubjectVariant)
        .where(SubjectVariant.subject_id == subject_id)
        .order_by(SubjectVariant.id)
    )
    return _variant_metas(session, list(variants))


@router.post("/{subject_id}/variants", response_model=list[VariantRead], status_code=201)
def upload_variants(
    subject_id: int,
    files: list[UploadFile],
    session: WriteSession,
    event_ids: Annotated[list[int], Form()] = [],  # noqa: B006
    current_teacher_id: int | None = Depends(teacher_id),
):
    subject = get_or_404(session, Subject, subject_id)
    _manage(subject, current_teacher_id)
    if not files:
        raise ValueError("Выберите файл")
    events = _check_events(session, subject, event_ids)
    uploads = [_read_upload(upload) for upload in files]
    created = []
    for filename, content_type, data in uploads:
        variant = SubjectVariant(
            subject_id=subject.id,
            name=Path(filename).stem,
            filename=filename,
            content_type=content_type,
            size=len(data),
            data=data,
        )
        session.add(variant)
        created.append(variant)
    session.flush()
    for variant in created:
        _attach(session, variant, events)
    session.flush()
    return _variant_metas(session, created)


def _variant_for_change(session, variant_id: int, current_teacher_id: int | None):
    variant = get_or_404(session, SubjectVariant, variant_id)
    _manage(session.get(Subject, variant.subject_id), current_teacher_id)
    return variant


@router.patch("/variants/{variant_id}", response_model=VariantRead)
def rename_variant(
    variant_id: int,
    data: VariantRename,
    session: WriteSession,
    current_teacher_id: int | None = Depends(teacher_id),
):
    variant = _variant_for_change(session, variant_id, current_teacher_id)
    variant.name = data.name
    session.flush()
    return _variant_metas(session, [variant])[0]


@router.put("/variants/{variant_id}/events", response_model=VariantRead)
def set_variant_events(
    variant_id: int,
    data: VariantEvents,
    session: WriteSession,
    current_teacher_id: int | None = Depends(teacher_id),
):
    variant = _variant_for_change(session, variant_id, current_teacher_id)
    subject = session.get(Subject, variant.subject_id)
    _attach(session, variant, _check_events(session, subject, data.event_ids))
    session.flush()
    return _variant_metas(session, [variant])[0]


@router.put("/variants/{variant_id}/file", response_model=VariantRead)
def replace_variant_file(
    variant_id: int,
    file: UploadFile,
    session: WriteSession,
    current_teacher_id: int | None = Depends(teacher_id),
):
    variant = _variant_for_change(session, variant_id, current_teacher_id)
    filename, content_type, data = _read_upload(file)
    variant.filename = filename
    variant.content_type = content_type
    variant.size = len(data)
    variant.data = data
    variant.uploaded_at = utcnow()
    session.flush()
    return _variant_metas(session, [variant])[0]


@router.get("/variants/{variant_id}/download")
def download_variant(variant_id: int, session: ReadSession):
    variant = get_or_404(session, SubjectVariant, variant_id)
    return Response(
        content=variant.data,
        media_type=variant.content_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(variant.filename)}"},
    )


@router.delete("/variants/{variant_id}")
def delete_variant(
    variant_id: int,
    session: WriteSession,
    current_teacher_id: int | None = Depends(teacher_id),
):
    variant = _variant_for_change(session, variant_id, current_teacher_id)
    session.execute(delete(VariantEvent).where(VariantEvent.variant_id == variant.id))
    session.delete(variant)
    session.flush()
    return {"ok": True}
