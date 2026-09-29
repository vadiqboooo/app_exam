from sqlalchemy import select
from sqlalchemy.orm import Session

from app.importers.record import normalize_name
from app.models import Exam, Subject


def effective_structure(session: Session, exam: Exam) -> dict | None:
    """Merge the exam snapshot with missing fields from its subject settings."""
    structure = dict(exam.structure_data or {})
    setting = next(
        (
            item
            for item in session.scalars(
                select(Subject).where(
                    Subject.format == exam.format,
                    Subject.is_active.is_(True),
                )
            )
            if normalize_name(item.name) == normalize_name(exam.subject)
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
    structure.setdefault("primary_to_secondary_scale", None)
    structure.setdefault("grade_scale", None)
    return structure


def calculate_final_score(
    exam_format: str | None, primary_score: float, structure: dict
) -> int | None:
    scale = structure.get("primary_to_secondary_scale")
    if scale:
        if not float(primary_score).is_integer():
            raise ValueError("Для автоматического пересчёта первичный балл должен быть целым")
        index = min(int(primary_score), len(scale) - 1)
        return int(scale[index])

    grade_scale = structure.get("grade_scale")
    if grade_scale:
        ranges = sorted(grade_scale, key=lambda item: item["min"])
        for item in ranges:
            if item["min"] <= primary_score <= item["max"]:
                return int(item["grade"])
        if primary_score < ranges[0]["min"]:
            return int(ranges[0]["grade"])
        return int(ranges[-1]["grade"])

    if exam_format == "ege":
        # Same fallback as crm_school_g for an EGE subject without a configured scale.
        return min(100, round(primary_score * 3.7))
    return None
