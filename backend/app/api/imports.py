from collections import Counter
from hashlib import sha256
from io import BytesIO
from typing import Annotated

from fastapi import APIRouter, Depends, Form, Request, UploadFile
from pydantic import Field, TypeAdapter, ValidationError

from app.api.backups import backup_state
from app.api.dependencies import ReadSession, require_admin
from app.database import transaction
from app.importers.excel import read_excel
from app.importers.school import read_groups, read_legacy, read_teachers
from app.services.school_import import (
    groups_preview,
    legacy_summary,
    run_import,
    students_preview,
    teachers_preview,
)
from app.services.sync import sync_students
from app.time import utcnow

router = APIRouter(prefix="/imports", tags=["imports"], dependencies=[Depends(require_admin)])
Grade = Annotated[int, Field(strict=True, ge=1, le=11)]
grade_selection = TypeAdapter(list[Grade | None])


def parse_grades(value: str | None) -> set[int | None] | None:
    if value is None:
        return None
    try:
        grades = grade_selection.validate_json(value)
    except ValidationError as error:
        raise ValueError(
            "Классы должны быть списком чисел от 1 до 11 или null (без класса)"
        ) from error
    if not grades:
        raise ValueError("Выберите хотя бы один класс")
    return set(grades)


def _teachers_file(file: UploadFile | None):
    return read_teachers(file.file) if file is not None else None


def _groups_file(file: UploadFile | None):
    return read_groups(file.file) if file is not None else None


@router.post("/teachers/preview")
def teachers_step(file: UploadFile, session: ReadSession, groups: UploadFile | None = None):
    return teachers_preview(session, read_teachers(file.file), _groups_file(groups))


@router.post("/groups/preview")
def groups_step(file: UploadFile, session: ReadSession, teachers: UploadFile | None = None):
    return groups_preview(session, read_groups(file.file), _teachers_file(teachers))


@router.post("/students/preview")
def students_step(file: UploadFile, session: ReadSession, groups: UploadFile | None = None):
    return students_preview(session, read_excel(file.file), _groups_file(groups))


@router.post("/legacy/analyze")
def legacy_step(file: UploadFile):
    return legacy_summary(read_legacy(file.file.read()))


def _run(
    request: Request,
    *,
    teachers: UploadFile | None,
    groups: UploadFile | None,
    students: UploadFile | None,
    legacy: UploadFile | None,
    confirmation: str | None,
):
    payloads = {
        name: file.file.read()
        for name, file in (
            ("teachers", teachers),
            ("groups", groups),
            ("students", students),
            ("legacy", legacy),
        )
        if file is not None
    }
    hashes = {name: sha256(data).hexdigest() for name, data in payloads.items()}
    with transaction(request.app.state.engine, write=True) as session:
        return run_import(
            session,
            teachers=read_teachers(BytesIO(payloads["teachers"]))
            if "teachers" in payloads
            else None,
            groups=read_groups(BytesIO(payloads["groups"])) if "groups" in payloads else None,
            students=read_excel(BytesIO(payloads["students"])) if "students" in payloads else None,
            legacy=read_legacy(payloads["legacy"]) if "legacy" in payloads else None,
            today=utcnow().date(),
            hashes=hashes,
            confirmation=confirmation,
        )


@router.post("/run/preview")
def run_preview(
    request: Request,
    teachers: UploadFile | None = None,
    groups: UploadFile | None = None,
    students: UploadFile | None = None,
    legacy: UploadFile | None = None,
):
    result = _run(
        request,
        teachers=teachers,
        groups=groups,
        students=students,
        legacy=legacy,
        confirmation=None,
    )
    # The last cloud backup is what the school falls back to if the import goes wrong.
    return {**result, "backup": backup_state(request)}


@router.post("/run/apply")
def run_apply(
    request: Request,
    confirmation: Annotated[str, Form(min_length=64)],
    teachers: UploadFile | None = None,
    groups: UploadFile | None = None,
    students: UploadFile | None = None,
    legacy: UploadFile | None = None,
):
    return _run(
        request,
        teachers=teachers,
        groups=groups,
        students=students,
        legacy=legacy,
        confirmation=confirmation,
    )


@router.post("/analyze")
def analyze(file: UploadFile):
    records = read_excel(file.file)
    counts = Counter(r.grade for r in records)
    return {
        "total": len(records),
        "grades": [
            {"grade": grade, "count": counts[grade]}
            for grade in sorted(counts, key=lambda g: (g is None, g or 0))
        ],
    }


@router.post("/preview")
def preview(
    request: Request,
    file: UploadFile,
    grades: Annotated[str | None, Form()] = None,
    allow_empty: bool = False,
):
    records = read_excel(file.file)
    with transaction(request.app.state.engine, write=True) as session:
        return sync_students(
            session,
            records,
            today=utcnow().date(),
            allow_empty=allow_empty,
            selected_grades=parse_grades(grades),
        )


@router.post("/apply")
def apply(
    request: Request,
    file: UploadFile,
    confirmation: Annotated[str, Form(min_length=64)],
    grades: Annotated[str | None, Form()] = None,
    allow_empty: bool = False,
):
    records = read_excel(file.file)
    with transaction(request.app.state.engine, write=True) as session:
        return sync_students(
            session,
            records,
            today=utcnow().date(),
            confirmation=confirmation,
            allow_empty=allow_empty,
            selected_grades=parse_grades(grades),
        )
