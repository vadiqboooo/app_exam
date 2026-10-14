"""Display metadata from CRM group names; the source name stays intact."""

import re

SUBJECT_ALIASES = {
    "Русский язык": r"русский(?:\s+(?:язык|яз\.?))?(?!\w)",
    "Английский язык": r"английский(?:\s+язык)?(?!\w)",
    "Математика": r"математика(?!\w)",
    "Информатика": r"информатика(?!\w)",
    "Обществознание": r"обществознание(?!\w)",
    "Биология": r"биология(?!\w)",
    "География": r"география(?!\w)",
    "История": r"история(?!\w)",
    "Физика": r"физика(?!\w)",
    "Химия": r"химия(?!\w)",
    "Литература": r"литература(?!\w)",
}
DAY = re.compile(r"(?<!\w)(?:пн|вт|ср|чт|пт|сб|вс)\.?(?=\s|\d|[,–—-]|$)", re.IGNORECASE)
TIME = re.compile(r"\d{1,2}:\d{2}")
PERSON = re.compile(r"[А-ЯЁ][а-яё]+(?:[- ][А-ЯЁ][а-яё]+|\s+[А-ЯЁ]\.)*")
EXAM_FORMAT = re.compile(r"(?<!\w)(ОГЭ|ЕГЭ)(?!\w)", re.IGNORECASE)


def group_details(source_name: str) -> dict:
    name = " ".join(source_name.split())
    subject = None
    subject_match = None
    for canonical, pattern in SUBJECT_ALIASES.items():
        match = re.search(rf"(?<!\w){pattern}", name, re.IGNORECASE)
        if match and (subject_match is None or match.start() < subject_match.start()):
            subject, subject_match = canonical, match
    remainder = (
        name[subject_match.end() :].strip(" —–-")
        if subject_match is not None and subject_match.start() == 0
        else name
    )
    format_match = EXAM_FORMAT.search(name)
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
