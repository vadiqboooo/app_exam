from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request, Response, UploadFile
from sqlalchemy import select

from app.api.dependencies import ReadSession, WriteSession, get_or_404
from app.models import ProgramMaterial, ProgramSection, ProgramTopic, Staff, Subject
from app.schemas.program import ProgramRead, ProgramWriteChecked, TopicStatusWrite
from app.services.malware_scan import scan_upload
from app.time import utcnow

router = APIRouter(prefix="/subjects/{subject_id}/program", tags=["subject program"])
MAX_MATERIAL_BYTES = 20 * 1024 * 1024


def _can_edit(request: Request, subject: Subject) -> bool:
    staff_id = getattr(request.state, "staff_id", None)
    return bool(getattr(request.state, "is_admin", False)) or (
        staff_id is not None and subject.responsible_id == staff_id
    )


def _read(session, subject_id: int, can_edit: bool, can_review: bool = False) -> dict:
    sections = list(
        session.scalars(
            select(ProgramSection)
            .where(ProgramSection.subject_id == subject_id)
            .order_by(ProgramSection.position, ProgramSection.id)
        )
    )
    topics_by_section: dict[int, list[ProgramTopic]] = {section.id: [] for section in sections}
    if sections:
        for topic in session.scalars(
            select(ProgramTopic)
            .where(ProgramTopic.section_id.in_(topics_by_section))
            .order_by(ProgramTopic.section_id, ProgramTopic.position, ProgramTopic.id)
        ):
            if can_edit or topic.status == "approved":
                topics_by_section[topic.section_id].append(topic)
    return {
        "subject_id": subject_id,
        "can_edit": can_edit,
        "can_review": can_review,
        "sections": [
            {
                "id": section.id,
                "title": section.title,
                "topics": [
                    {
                        "id": topic.id,
                        "title": topic.title,
                        "author_name": topic.author_name,
                        "status": topic.status,
                        "approved_at": topic.approved_at,
                    }
                    for topic in topics_by_section[section.id]
                ],
            }
            for section in sections
            if can_edit or topics_by_section[section.id]
        ],
    }


@router.get("", response_model=ProgramRead)
def get_program(subject_id: int, request: Request, session: ReadSession):
    subject = get_or_404(session, Subject, subject_id)
    return _read(
        session, subject.id, _can_edit(request, subject),
        bool(getattr(request.state, "is_admin", False)),
    )


@router.patch("/topics/{topic_id}/status", response_model=ProgramRead)
def update_topic_status(
    subject_id: int, topic_id: int, data: TopicStatusWrite,
    request: Request, session: WriteSession,
):
    subject = get_or_404(session, Subject, subject_id)
    if not _can_edit(request, subject):
        raise HTTPException(403, "Статус темы может менять только ответственный за предмет")
    is_admin = bool(getattr(request.state, "is_admin", False))
    if not is_admin and data.status not in {"draft", "review"}:
        raise HTTPException(403, "Одобрить тему или запросить исправления может только администратор")
    topic = _topic(session, subject_id, topic_id, request, edit=True)
    topic.status = data.status
    if data.status == "approved":
        topic.approved_by = getattr(request.state, "staff_id", None)
        topic.approved_at = utcnow()
    else:
        topic.approved_by = None
        topic.approved_at = None
    session.flush()
    return _read(session, subject_id, True, is_admin)


def _topic(session, subject_id: int, topic_id: int, request: Request, *, edit: bool = False):
    subject = get_or_404(session, Subject, subject_id)
    topic = session.get(ProgramTopic, topic_id)
    section = session.get(ProgramSection, topic.section_id) if topic else None
    if section is None or section.subject_id != subject.id:
        raise HTTPException(404, "Тема не найдена")
    can_edit = _can_edit(request, subject)
    if edit and not can_edit:
        raise HTTPException(403, "Материалы может менять только ответственный за предмет")
    if not can_edit and topic.status != "approved":
        raise HTTPException(404, "Тема не найдена")
    return topic


def _material_meta(material: ProgramMaterial) -> dict:
    return {
        "id": material.id,
        "filename": material.filename,
        "size": material.size,
        "uploaded_at": material.uploaded_at,
        "scanned_at": material.scanned_at,
    }


@router.get("/topics/{topic_id}/materials")
def list_materials(subject_id: int, topic_id: int, request: Request, session: ReadSession):
    _topic(session, subject_id, topic_id, request)
    materials = session.scalars(
        select(ProgramMaterial)
        .where(ProgramMaterial.topic_id == topic_id)
        .order_by(ProgramMaterial.id)
    )
    return [_material_meta(material) for material in materials]


@router.post("/topics/{topic_id}/materials", status_code=201)
def upload_material(
    subject_id: int, topic_id: int, file: UploadFile, request: Request, session: WriteSession
):
    topic = _topic(session, subject_id, topic_id, request, edit=True)
    filename = Path(file.filename or "").name
    if not filename or filename in {".", ".."}:
        raise HTTPException(400, "Укажите имя файла")
    data = file.file.read(MAX_MATERIAL_BYTES + 1)
    if not data or len(data) > MAX_MATERIAL_BYTES:
        raise HTTPException(400, "Файл должен быть непустым и не больше 20 МБ")
    settings = request.app.state.settings
    scan_upload(data, settings.clamav_host, settings.clamav_port)
    material = ProgramMaterial(
        topic_id=topic.id,
        filename=filename,
        content_type=file.content_type or "application/octet-stream",
        size=len(data),
        scanned_at=utcnow(),
        data=data,
    )
    session.add(material)
    if topic.status == "approved":
        topic.status = "draft"
        topic.approved_by = None
        topic.approved_at = None
    session.flush()
    return _material_meta(material)


@router.get("/topics/{topic_id}/materials/{material_id}/download")
def download_material(
    subject_id: int, topic_id: int, material_id: int, request: Request, session: ReadSession
):
    _topic(session, subject_id, topic_id, request)
    material = session.get(ProgramMaterial, material_id)
    if material is None or material.topic_id != topic_id:
        raise HTTPException(404, "Материал не найден")
    return Response(
        material.data,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(material.filename)}"},
    )


@router.delete("/topics/{topic_id}/materials/{material_id}", status_code=204)
def delete_material(
    subject_id: int, topic_id: int, material_id: int, request: Request, session: WriteSession
):
    topic = _topic(session, subject_id, topic_id, request, edit=True)
    material = session.get(ProgramMaterial, material_id)
    if material is None or material.topic_id != topic_id:
        raise HTTPException(404, "Материал не найден")
    session.delete(material)
    if topic.status == "approved":
        topic.status = "draft"
        topic.approved_by = None
        topic.approved_at = None


@router.put("", response_model=ProgramRead)
def save_program(
    subject_id: int, data: ProgramWriteChecked, request: Request, session: WriteSession
):
    subject = get_or_404(session, Subject, subject_id)
    if not _can_edit(request, subject):
        raise HTTPException(403, "Программу может менять только ответственный за предмет")

    staff_id = getattr(request.state, "staff_id", None)
    author = session.get(Staff, staff_id).name if staff_id is not None else "Администратор"

    old_sections = {
        section.id: section
        for section in session.scalars(
            select(ProgramSection).where(ProgramSection.subject_id == subject.id)
        )
    }
    old_topics = (
        {
            topic.id: topic
            for topic in session.scalars(
                select(ProgramTopic).where(ProgramTopic.section_id.in_(old_sections))
            )
        }
        if old_sections
        else {}
    )

    wanted_section_ids = {item.id for item in data.sections if item.id is not None}
    wanted_topic_ids = {
        topic.id for item in data.sections for topic in item.topics if topic.id is not None
    }
    if not wanted_section_ids <= old_sections.keys() or not wanted_topic_ids <= old_topics.keys():
        raise ValueError("Раздел или тема не принадлежат этому предмету")

    for position, section_data in enumerate(data.sections):
        section = old_sections.get(section_data.id) if section_data.id else None
        if section is None:
            section = ProgramSection(
                subject_id=subject.id, position=position, title=section_data.title
            )
            session.add(section)
            session.flush()
            section_changed = True
        else:
            section_changed = section.title != section_data.title
        section.title = section_data.title
        section.position = position

        for topic_position, topic_data in enumerate(section_data.topics):
            topic = old_topics.get(topic_data.id) if topic_data.id else None
            if topic is None:
                topic = ProgramTopic(section_id=section.id, status="draft", author_name=author)
                session.add(topic)
            elif (
                topic.title != topic_data.title or topic.section_id != section.id or section_changed
            ):
                # An edited approved topic must go through review again.
                topic.status = "draft"
                topic.approved_by = None
                topic.approved_at = None
            topic.section_id = section.id
            topic.position = topic_position
            topic.title = topic_data.title

    for topic_id, topic in old_topics.items():
        if topic_id not in wanted_topic_ids:
            session.delete(topic)
    for section_id, section in old_sections.items():
        if section_id not in wanted_section_ids:
            session.delete(section)
    session.flush()
    return _read(session, subject.id, True, bool(getattr(request.state, "is_admin", False)))
