from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator

from app.schemas.base import NonEmpty, Schema

TopicStatus = Literal["draft", "review", "changes", "approved"]


class TopicWrite(Schema):
    id: int | None = Field(default=None, gt=0)
    title: NonEmpty = Field(max_length=300)


class SectionWrite(Schema):
    id: int | None = Field(default=None, gt=0)
    title: NonEmpty = Field(max_length=200)
    topics: list[TopicWrite] = Field(default_factory=list, max_length=200)


class ProgramWrite(Schema):
    sections: list[SectionWrite] = Field(default_factory=list, max_length=50)


class TopicRead(Schema):
    id: int
    title: str
    author_name: str | None
    status: TopicStatus
    approved_at: datetime | None


class TopicStatusWrite(Schema):
    status: TopicStatus


class SectionRead(Schema):
    id: int
    title: str
    topics: list[TopicRead]


class ProgramRead(Schema):
    subject_id: int
    can_edit: bool
    can_review: bool
    sections: list[SectionRead]


class ProgramWriteChecked(ProgramWrite):
    @field_validator("sections")
    @classmethod
    def unique_ids(cls, sections: list[SectionWrite]):
        section_ids = [section.id for section in sections if section.id is not None]
        topic_ids = [
            topic.id for section in sections for topic in section.topics if topic.id is not None
        ]
        if len(section_ids) != len(set(section_ids)) or len(topic_ids) != len(set(topic_ids)):
            raise ValueError("Раздел или тема повторяются в программе")
        return sections
