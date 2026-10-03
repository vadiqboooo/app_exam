from app.api.participations import checker_name
from app.database import transaction
from app.models import Exam, Participation, Staff, Student
from app.schemas.participation import ResultWrite
from app.services.participation import save_result
from app.time import utcnow


def seed(session):
    student = Student(full_name="Иванов Алексей", name_key="иванов алексей", grade=10)
    exam = Exam(type="mock", subject="Физика", title="Тест", starts_at=utcnow(), is_active=True)
    session.add_all([student, exam])
    session.flush()
    item = Participation(student_id=student.id, exam_id=exam.id, status="submitted")
    session.add(item)
    session.flush()
    return exam, item


def test_republishing_keeps_original_checker_until_scores_change(engine):
    with transaction(engine, write=True) as session:
        exam, item = seed(session)
        scores = ResultWrite(primary_score=5, test_score=60, result_data=None)

        save_result(session, item, scores, "Екатерина Сергеевна")
        assert item.checked_by == "Екатерина Сергеевна"

        save_result(session, item, scores, "Администратор")
        assert item.checked_by == "Екатерина Сергеевна"

        save_result(
            session,
            item,
            ResultWrite(primary_score=6, test_score=64, result_data=None),
            "Администратор",
        )
        assert item.checked_by == "Администратор"


def test_checker_name_uses_teacher_name_or_admin(engine):
    with transaction(engine, write=True) as session:
        teacher = Staff(name="Олег Викторович", role="teacher", login="oleg", password_hash="x")
        session.add(teacher)
        session.flush()
        assert checker_name(session, teacher.id) == "Олег Викторович"
        assert checker_name(session, None) == "Администратор"
