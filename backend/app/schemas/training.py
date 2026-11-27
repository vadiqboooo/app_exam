from typing import Literal

from pydantic import BaseModel, Field, model_validator


class QuestionWrite(BaseModel):
    prompt: str = Field(min_length=1, max_length=500)
    kind: Literal["single", "multiple", "text"]
    options: list[str] = Field(default_factory=list, max_length=12)
    answer: list[int] | str

    @model_validator(mode="after")
    def valid_answer(self):
        if self.kind == "text":
            if not isinstance(self.answer, str) or not self.answer.strip():
                raise ValueError("Укажите правильный текстовый ответ")
            self.options = []
        else:
            if len(self.options) < 2 or any(not option.strip() for option in self.options):
                raise ValueError("У вопроса должно быть не менее двух вариантов")
            if not isinstance(self.answer, list) or not self.answer:
                raise ValueError("Выберите правильный ответ")
            if len(set(self.answer)) != len(self.answer) or any(
                index < 0 or index >= len(self.options) for index in self.answer
            ):
                raise ValueError("Неверные индексы правильных ответов")
            if self.kind == "single" and len(self.answer) != 1:
                raise ValueError("У вопроса с одним выбором должен быть один ответ")
        return self


class TopicWrite(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    description: str = Field(default="", max_length=600)
    position: int = Field(default=0, ge=0)
    video_url: str | None = None
    material_text: str = Field(default="", max_length=100000)
    published: bool = False
    pass_percent: int = Field(default=80, ge=1, le=100)
    questions: list[QuestionWrite] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def has_content_if_published(self):
        if self.video_url and not (
            self.video_url.startswith(("https://", "http://"))
            or self.video_url.startswith("/api/training/media/")
        ):
            raise ValueError("Укажите ссылку на видео или загрузите файл")
        if self.published and not (self.video_url or self.material_text.strip() or self.questions):
            raise ValueError("Добавьте видео, материал или тест перед публикацией")
        return self


class ProgressWrite(BaseModel):
    video_percent: int | None = Field(default=None, ge=0, le=100)
    video_position_seconds: int | None = Field(default=None, ge=0, le=86400)
    material_read: bool | None = None


class AttemptWrite(BaseModel):
    answers: dict[int, list[int] | str]
