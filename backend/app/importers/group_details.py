"""Display metadata from CRM group names; the source name stays intact."""

import re

SUBJECTS = (
    "Русский язык",
    "Английский язык",
    "Математика",
    "Информатика",
    "Обществознание",
    "Биология",
    "География",
    "История",
    "Физика",
    "Химия",
    "Литература",
)
DAY = re.compile(r"(?<!\w)(?:пн|вт|ср|чт|пт|сб|вс)\.?(?=\s|\d|[,–—-]|$)", re.IGNORECASE)
TIME = re.compile(r"\d{1,2}:\d{2}")
PERSON = re.compile(r"[А-ЯЁ][а-яё]+(?:[- ][А-ЯЁ][а-яё]+|\s+[А-ЯЁ]\.)*")
EXAM_FORMAT = re.compile(r"(?<!\w)(ОГЭ|ЕГЭ)(?!\w)", re.IGNORECASE)


def group_details(source_name: str) -> dict:
    name = " ".join(source_name.split())
    subject = next((s for s in SUBJECTS if re.match(rf"{s}(?!\w)", name, re.IGNORECASE)), None)
    remainder = name[len(subject) :].strip(" —–-") if subject else name
    format_match = EXAM_FORMAT.search(remainder)
    exam_format = (
        ("oge" if format_match and format_match.group(1).upper() == "ОГЭ" else "ege")
        if format_match
        else None
    )
    day = DAY.search(remainder)
    teacher = None
    schedule = None
    if day:
        schedule = remainder[day.start() :]
        remainder = remainder[: day.start()].strip(" —–-.")
        times = list(TIME.finditer(schedule))
        if times:
            tail = schedule[times[-1].end() :].strip(" —–-").lstrip(". ")
            if PERSON.fullmatch(tail):
                teacher = tail
                schedule = schedule[: times[-1].end()]
        if teacher is None and PERSON.fullmatch(remainder):
            teacher = remainder
    return {
        "display_name": remainder or subject or name,
        "subject": subject,
        "exam_format": exam_format,
        "teacher_name": teacher,
        "schedule": schedule,
    }
