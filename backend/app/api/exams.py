from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.api.dependencies import Limit, Offset, ReadSession, WriteSession, get_or_404, require_admin
from app.models import Exam
from app.schemas.exam import ExamCreate, ExamRead
from app.services.exams import read_exams

router = APIRouter(prefix="/exams", tags=["exams"])


@router.post(
    "",
    response_model=ExamRead,
    status_code=201,
    dependencies=[Depends(require_admin)],
)
def create_exam(data: ExamCreate, session: WriteSession):
    values = data.model_dump()
    values = {
        k: v.replace(tzinfo=None) if isinstance(v, datetime) else v for k, v in values.items()
    }
    exam = Exam(**values)
    session.add(exam)
    session.flush()
    return exam


@router.get("", response_model=list[ExamRead])
def list_exams(session: ReadSession, limit: Limit = 100, offset: Offset = 0):
    return read_exams(
        session,
        list(
            session.scalars(
                select(Exam).order_by(Exam.starts_at, Exam.id).limit(limit).offset(offset)
            )
        ),
    )


@router.get("/{exam_id}", response_model=ExamRead)
def get_exam(exam_id: int, session: ReadSession):
    return read_exams(session, [get_or_404(session, Exam, exam_id)])[0]
