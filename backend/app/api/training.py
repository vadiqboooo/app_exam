from datetime import UTC, datetime
from pathlib import Path
import re
import secrets
import shutil
import threading
import time
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import delete, select

from app.api.dependencies import ReadSession, WriteSession, require_admin, staff_id
from app.models import Staff, TrainingAttempt, TrainingProgress, TrainingQuestion, TrainingTopic
from app.schemas.training import AttemptWrite, ProgressWrite, TopicWrite
from app.services.malware_scan import scan_upload
from app.services.training_video import MAX_VIDEO_BYTES, VIDEO_ROOT, encode_video

router = APIRouter(prefix="/training", tags=["training"])
_video_jobs: dict[str, dict] = {}
_video_jobs_lock = threading.Lock()


def _set_video_job(job_id: str, stage: str, percent: int | None = None):
    with _video_jobs_lock:
        _video_jobs[job_id] = {"stage": stage, "percent": percent, "updated": time.monotonic()}

Part = Literal["groups", "outside"]


def _utc(value):
    return value.replace(tzinfo=UTC) if value is not None else None


def _read(staff: Staff) -> dict:
    return {
        "groups_at": _utc(staff.training_groups_at),
        "outside_at": _utc(staff.training_outside_at),
    }


def _me(session, current_staff_id: int | None) -> Staff:
    staff = session.get(Staff, current_staff_id) if current_staff_id is not None else None
    if staff is None:
        raise HTTPException(404, "Обучение доступно сотрудникам с личным входом")
    return staff


@router.get("")
def my_training(session: ReadSession, current_staff_id: int | None = Depends(staff_id)):
    if current_staff_id is None:
        return {"groups_at": None, "outside_at": None}
    return _read(_me(session, current_staff_id))


@router.post("/{part}")
def finish_part(
    part: Part, session: WriteSession, current_staff_id: int | None = Depends(staff_id)
):
    staff = _me(session, current_staff_id)
    now = datetime.now(UTC).replace(tzinfo=None)
    # Passing a part again keeps the first date.
    if part == "groups":
        staff.training_groups_at = staff.training_groups_at or now
    else:
        staff.training_outside_at = staff.training_outside_at or now
    session.flush()
    return _read(staff)


def _topic(session, topic_id: int, published_only: bool = False) -> TrainingTopic:
    topic = session.get(TrainingTopic, topic_id)
    if topic is None or (published_only and not topic.published):
        raise HTTPException(404, "Тема обучения не найдена")
    return topic


def _questions(session, topic_id: int) -> list[TrainingQuestion]:
    return list(session.scalars(select(TrainingQuestion).where(TrainingQuestion.topic_id == topic_id).order_by(TrainingQuestion.position, TrainingQuestion.id)))


def _progress(session, person_id: int, topic_id: int, create: bool = False) -> TrainingProgress | None:
    progress = session.scalar(select(TrainingProgress).where(TrainingProgress.staff_id == person_id, TrainingProgress.topic_id == topic_id))
    if progress is None and create:
        progress = TrainingProgress(staff_id=person_id, topic_id=topic_id, video_percent=0, material_read=False)
        session.add(progress)
        session.flush()
    return progress


def _passed(topic: TrainingTopic, progress: TrainingProgress | None, question_count: int) -> bool:
    return bool(progress and (not topic.video_url or progress.video_percent >= 90)
                and (not topic.material_text.strip() or progress.material_read)
                and (not question_count or (progress.best_score is not None and progress.best_score * 100 >= topic.pass_percent * question_count)))


def _read_topic(session, topic: TrainingTopic, person_id: int | None = None, admin: bool = False) -> dict:
    questions = _questions(session, topic.id)
    progress = _progress(session, person_id, topic.id) if person_id is not None else None
    attempts = list(session.scalars(select(TrainingAttempt).where(TrainingAttempt.staff_id == person_id, TrainingAttempt.topic_id == topic.id).order_by(TrainingAttempt.created_at.desc(), TrainingAttempt.id.desc()))) if person_id is not None else []
    return {
        "id": topic.id, "title": topic.title, "description": topic.description,
        "position": topic.position, "video_url": topic.video_url, "material_text": topic.material_text,
        "published": topic.published, "pass_percent": topic.pass_percent,
        "questions": [{"id": q.id, "prompt": q.prompt, "kind": q.kind, "options": q.options,
                       **({"answer": q.answer} if admin else {})} for q in questions],
        "progress": {"video_percent": progress.video_percent if progress else 0,
                     "video_position_seconds": progress.video_position_seconds if progress else 0,
                     "material_read": progress.material_read if progress else False,
                     "best_score": progress.best_score if progress else None,
                     "completed_at": _utc(progress.completed_at) if progress else None,
                     "passed": _passed(topic, progress, len(questions))},
        "attempts": [{"id": attempt.id, "score": attempt.score, "total": attempt.total,
                      "created_at": _utc(attempt.created_at)} for attempt in attempts],
    }


@router.get("/topics")
def my_topics(session: ReadSession, current_staff_id: int | None = Depends(staff_id)):
    person = _me(session, current_staff_id)
    return [_read_topic(session, topic, person.id) for topic in session.scalars(select(TrainingTopic).where(TrainingTopic.published.is_(True)).order_by(TrainingTopic.position, TrainingTopic.id))]


@router.get("/admin/topics", dependencies=[Depends(require_admin)])
def admin_topics(session: ReadSession):
    return [_read_topic(session, topic, admin=True) for topic in session.scalars(select(TrainingTopic).order_by(TrainingTopic.position, TrainingTopic.id))]


def _apply_topic(session, topic: TrainingTopic, data: TopicWrite):
    old = [(q.prompt, q.kind, q.options, q.answer) for q in _questions(session, topic.id)]
    new = [(q.prompt.strip(), q.kind, q.options, q.answer) for q in data.questions]
    quiz_changed = old != new or topic.pass_percent != data.pass_percent
    video_changed = topic.video_url != (str(data.video_url) if data.video_url else None)
    content_changed = quiz_changed or video_changed or topic.material_text != data.material_text
    topic.title = data.title.strip()
    topic.description = data.description.strip()
    topic.position = data.position
    topic.video_url = str(data.video_url) if data.video_url else None
    topic.material_text = data.material_text
    topic.published = data.published
    topic.pass_percent = data.pass_percent
    if old != new:
        session.execute(delete(TrainingQuestion).where(TrainingQuestion.topic_id == topic.id))
        for index, q in enumerate(data.questions):
            session.add(TrainingQuestion(topic_id=topic.id, position=index, prompt=q.prompt.strip(), kind=q.kind, options=q.options, answer=q.answer))
    if content_changed:
        for progress in session.scalars(select(TrainingProgress).where(TrainingProgress.topic_id == topic.id)):
            if quiz_changed:
                progress.best_score = None
            if video_changed:
                progress.video_percent = 0
                progress.video_position_seconds = 0
            progress.completed_at = None
    session.flush()
    return _read_topic(session, topic, admin=True)


@router.post("/admin/topics", status_code=201, dependencies=[Depends(require_admin)])
def create_topic(data: TopicWrite, session: WriteSession):
    topic = TrainingTopic(title=data.title.strip(), description="", position=data.position,
                          video_url=None, material_text="", published=False, pass_percent=80)
    session.add(topic)
    session.flush()
    return _apply_topic(session, topic, data)


@router.put("/admin/topics/{topic_id}", dependencies=[Depends(require_admin)])
def update_topic(topic_id: int, data: TopicWrite, session: WriteSession):
    return _apply_topic(session, _topic(session, topic_id), data)


@router.delete("/admin/topics/{topic_id}", status_code=204, dependencies=[Depends(require_admin)])
def delete_topic(topic_id: int, session: WriteSession):
    topic = _topic(session, topic_id)
    old_asset = _video_asset(topic.video_url)
    for model in (TrainingAttempt, TrainingProgress, TrainingQuestion):
        session.execute(delete(model).where(model.topic_id == topic_id))
    session.delete(topic)
    if old_asset:
        shutil.rmtree(VIDEO_ROOT / old_asset, ignore_errors=True)


def _video_asset(url: str | None) -> str | None:
    match = re.fullmatch(r"/api/training/media/([0-9a-f]{32})/master\.m3u8", url or "")
    return match.group(1) if match else None


@router.post("/admin/topics/{topic_id}/video", dependencies=[Depends(require_admin)])
def upload_video(topic_id: int, file: UploadFile, request: Request, session: WriteSession,
                 upload_id: str = Header(alias="X-Upload-Id")):
    if not re.fullmatch(r"[0-9a-f]{32}", upload_id):
        raise HTTPException(400, "Неверный идентификатор загрузки")
    topic = _topic(session, topic_id)
    with _video_jobs_lock:
        expired = [key for key, value in _video_jobs.items() if time.monotonic() - value["updated"] > 3600]
        for key in expired:
            del _video_jobs[key]
    _set_video_job(upload_id, "Проверка файла")
    try:
        if Path(file.filename or "").suffix.lower() not in {".mp4", ".mov", ".webm", ".mkv"}:
            raise HTTPException(400, "Загрузите видео MP4, MOV, WebM или MKV")
        data = file.file.read(MAX_VIDEO_BYTES + 1)
        if not data or len(data) > MAX_VIDEO_BYTES:
            raise HTTPException(400, "Видео должно быть непустым и не больше 300 МБ")
        settings = request.app.state.settings
        scan_upload(data, settings.clamav_host, settings.clamav_port)
        _set_video_job(upload_id, "Подготовка видео", 0)
        asset_id = secrets.token_hex(16)
        qualities = encode_video(data, asset_id, lambda value: _set_video_job(upload_id, "Подготовка видео", value))
        old_asset = _video_asset(topic.video_url)
        topic.video_url = f"/api/training/media/{asset_id}/master.m3u8"
        for progress in session.scalars(select(TrainingProgress).where(TrainingProgress.topic_id == topic.id)):
            progress.video_percent = 0
            progress.video_position_seconds = 0
            progress.completed_at = None
        session.flush()
        if old_asset:
            shutil.rmtree(VIDEO_ROOT / old_asset, ignore_errors=True)
        _set_video_job(upload_id, "Готово", 100)
        return {"video_url": topic.video_url, "qualities": qualities}
    except Exception:
        _set_video_job(upload_id, "Ошибка")
        raise


@router.get("/admin/video-jobs/{upload_id}", dependencies=[Depends(require_admin)])
def video_job(upload_id: str):
    with _video_jobs_lock:
        job = _video_jobs.get(upload_id)
        if job is None:
            raise HTTPException(404, "Загрузка не найдена")
        return {"stage": job["stage"], "percent": job["percent"]}


@router.delete("/admin/topics/{topic_id}/video", dependencies=[Depends(require_admin)])
def delete_video(topic_id: int, session: WriteSession):
    topic = _topic(session, topic_id)
    old_asset = _video_asset(topic.video_url)
    topic.video_url = None
    if not topic.material_text.strip() and not _questions(session, topic_id):
        topic.published = False
    for progress in session.scalars(select(TrainingProgress).where(TrainingProgress.topic_id == topic.id)):
        progress.video_percent = 0
        progress.video_position_seconds = 0
        progress.completed_at = None
    session.flush()
    if old_asset:
        shutil.rmtree(VIDEO_ROOT / old_asset, ignore_errors=True)
    return _read_topic(session, topic, admin=True)


@router.get("/media/{asset_id}/{file_path:path}")
def video_media(asset_id: str, file_path: str, request: Request, session: ReadSession):
    if not re.fullmatch(r"[0-9a-f]{32}", asset_id) or not re.fullmatch(
        r"(?:master\.m3u8|(?:360|720|1080|[0-9]{2,4})p/(?:index\.m3u8|segment_[0-9]{5}\.ts))", file_path
    ):
        raise HTTPException(404, "Видео не найдено")
    url = f"/api/training/media/{asset_id}/master.m3u8"
    topic = session.scalar(select(TrainingTopic).where(TrainingTopic.video_url == url))
    if topic is None or (not topic.published and not request.state.is_admin):
        raise HTTPException(404, "Видео не найдено")
    path = VIDEO_ROOT / asset_id / file_path
    if not path.is_file():
        raise HTTPException(404, "Фрагмент видео не найден")
    return FileResponse(path, media_type="application/vnd.apple.mpegurl" if path.suffix == ".m3u8" else "video/mp2t",
                        headers={"Cache-Control": "private, max-age=3600"})


@router.get("/admin/progress", dependencies=[Depends(require_admin)])
def admin_progress(session: ReadSession):
    topics = list(session.scalars(select(TrainingTopic).where(TrainingTopic.published.is_(True)).order_by(TrainingTopic.position, TrainingTopic.id)))
    people = list(session.scalars(select(Staff).where(Staff.is_teacher.is_(True), Staff.is_active.is_(True)).order_by(Staff.name)))
    counts = {topic.id: len(_questions(session, topic.id)) for topic in topics}
    rows = []
    for person in people:
        progress_rows = [
            {"topic_id": -1, "title": "Заполнение пробников: результаты группы",
             "kind": "legacy", "passed": bool(person.training_groups_at),
             "has_video": False, "has_material": False, "question_count": 0,
             "pass_percent": 0, "video_percent": 0, "material_read": False,
             "best_score": None, "completed_at": _utc(person.training_groups_at),
             "attempts": []},
            {"topic_id": -2, "title": "Заполнение пробников: ученик не из группы",
             "kind": "legacy", "passed": bool(person.training_outside_at),
             "has_video": False, "has_material": False, "question_count": 0,
             "pass_percent": 0, "video_percent": 0, "material_read": False,
             "best_score": None, "completed_at": _utc(person.training_outside_at),
             "attempts": []},
        ]
        for topic in topics:
            progress = _progress(session, person.id, topic.id)
            attempts = list(session.scalars(select(TrainingAttempt).where(
                TrainingAttempt.staff_id == person.id,
                TrainingAttempt.topic_id == topic.id,
            ).order_by(TrainingAttempt.created_at.desc(), TrainingAttempt.id.desc())))
            progress_rows.append({"topic_id": topic.id, "title": topic.title,
                                  "passed": _passed(topic, progress, counts[topic.id]),
                                  "has_video": bool(topic.video_url),
                                  "has_material": bool(topic.material_text.strip()),
                                  "question_count": counts[topic.id],
                                  "pass_percent": topic.pass_percent,
                                  "video_percent": progress.video_percent if progress else 0,
                                  "video_position_seconds": progress.video_position_seconds if progress else 0,
                                  "material_read": progress.material_read if progress else False,
                                  "best_score": progress.best_score if progress else None,
                                  "completed_at": _utc(progress.completed_at) if progress else None,
                                  "attempts": [{"id": attempt.id, "score": attempt.score,
                                                "total": attempt.total, "created_at": _utc(attempt.created_at)}
                                               for attempt in attempts]})
        rows.append({"id": person.id, "name": person.name, "topics": progress_rows})
    return rows


@router.patch("/topics/{topic_id}/progress")
def save_progress(topic_id: int, data: ProgressWrite, session: WriteSession,
                  current_staff_id: int | None = Depends(staff_id)):
    person = _me(session, current_staff_id)
    topic = _topic(session, topic_id, published_only=True)
    progress = _progress(session, person.id, topic_id, create=True)
    if data.video_percent is not None:
        progress.video_percent = max(progress.video_percent, data.video_percent)
    if data.video_position_seconds is not None and topic.video_url:
        progress.video_position_seconds = data.video_position_seconds
    if data.material_read is not None:
        progress.material_read = data.material_read
    if _passed(topic, progress, len(_questions(session, topic_id))):
        progress.completed_at = progress.completed_at or datetime.now(UTC).replace(tzinfo=None)
    else:
        progress.completed_at = None
    session.flush()
    return _read_topic(session, topic, person.id)


@router.post("/topics/{topic_id}/attempts")
def submit_attempt(topic_id: int, data: AttemptWrite, session: WriteSession,
                   current_staff_id: int | None = Depends(staff_id)):
    person = _me(session, current_staff_id)
    topic = _topic(session, topic_id, published_only=True)
    questions = _questions(session, topic_id)
    if not questions:
        raise HTTPException(400, "В этой теме нет теста")
    if set(data.answers) != {q.id for q in questions}:
        raise HTTPException(422, "Ответьте на все вопросы")
    score = 0
    for question in questions:
        answer = data.answers[question.id]
        if question.kind == "text":
            score += isinstance(answer, str) and answer.strip().casefold() == str(question.answer).strip().casefold()
        else:
            score += isinstance(answer, list) and set(answer) == set(question.answer) and len(answer) == len(question.answer)
    now = datetime.now(UTC).replace(tzinfo=None)
    session.add(TrainingAttempt(staff_id=person.id, topic_id=topic_id, score=score,
                                total=len(questions), created_at=now))
    progress = _progress(session, person.id, topic_id, create=True)
    progress.best_score = max(progress.best_score or 0, score)
    if _passed(topic, progress, len(questions)) and progress.completed_at is None:
        progress.completed_at = now
    session.flush()
    return {"score": score, "total": len(questions),
            "passed": score * 100 >= topic.pass_percent * len(questions),
            "topic": _read_topic(session, topic, person.id)}
