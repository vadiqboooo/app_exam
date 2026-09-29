"""Isolated backend for browser tests: never touches the user's database."""

import os
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

BACKEND = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND))

import uvicorn  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from openpyxl import Workbook  # noqa: E402

from app.main import create_app  # noqa: E402

fixtures = Path(__file__).parent / "fixtures"
fixtures.mkdir(exist_ok=True)
book = Workbook()
book.active.append(["ФИО", "Статус обучения", "Активные группы", "Класс обучения", "ID"])
book.active.append(["Иванов Алексей", "Обучается", "Информатика ЕГЭ СР 16:30-19:30 Вадим Сергеевич", 11, "test-1"])
book.active.append(["Петрова Анна", "Обучается", "Информатика ЕГЭ СР 16:30-19:30 Вадим Сергеевич", 11, "test-2"])
book.active.append(["Сидоров Максим", "Обучается", "Математика ЕГЭ — 11 класс", 11, "test-3"])
book.save(fixtures / "crm.xlsx")
book.close()

book = Workbook()
book.active.append(["ФИО", "Статус обучения", "Активные группы", "Класс обучения", "ID"])
book.active.append(["Выбранов Иван", "Обучается", "Физика ОГЭ", 9, "grade-9-one"])
book.active.append(["Выбранова Анна", "Обучается", "Физика ОГЭ", 9, "grade-9-two"])
book.active.append(["Пропусков Пётр", "Обучается", "Химия ЕГЭ", 11, "grade-11"])
book.active.append(["Неизвестнов Олег", "Обучается", "История", None, "grade-unknown"])
book.save(fixtures / "grades.xlsx")
book.close()

with TemporaryDirectory(prefix="probnik-e2e-") as directory:
    os.environ["DATABASE_URL"] = f"sqlite:///{Path(directory).as_posix()}/test.db"
    os.environ["API_KEY"] = "e2e-test-key"
    os.environ["STUDENT_TEST_LOGIN"] = "true"
    command.upgrade(Config(str(BACKEND / "alembic.ini")), "head")
    uvicorn.run(create_app(), host="127.0.0.1", port=8765)
