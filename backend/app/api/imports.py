from collections import Counter
from typing import Annotated

from fastapi import APIRouter, Depends, Form, Request, UploadFile
from pydantic import Field, TypeAdapter, ValidationError

from app.api.dependencies import require_admin
from app.database import transaction
from app.importers.excel import read_excel
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
