import { useState } from 'react';
import { ArrowUpRight, CalendarDays, Award } from 'lucide-react';
import { useStudentWorkspace } from '../../layouts/StudentWorkspace';
import { PageHeader } from '../../components/PageHeader';
import { FilterBar } from '../../components/FilterBar';
import { EmptyState } from '../../components/EmptyState';
import { Modal } from '../../components/Modal';
import { ResultDetails } from '../../components/ResultDetails';
import { date, examDate, examTitle, score } from '../../lib/format';

export function MyResults() {
  const { data } = useStudentWorkspace();
  const [subject, setSubject] = useState('');
  const [selected, setSelected] = useState<number>();
  const results = data.results
    .flatMap((result) => {
      const exam = data.exams.find((e) => e.id === result.exam_id);
      return exam ? [{ result, exam }] : [];
    })
    .sort((a, b) => a.exam.starts_at.localeCompare(b.exam.starts_at));
  const subjects = [...new Set(results.map((r) => r.exam.subject))];
  const current = results.find((r) => r.result.id === selected);
  return (
    <div className="stack page-stack">
      <PageHeader
        title="Мои результаты"
        subtitle="Ваш прогресс, подробные баллы и обратная связь преподавателя."
      />
      {results.length ? (
        <>
          <FilterBar>
            <select
              aria-label="Предмет результатов"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              <option value="">Все предметы</option>
              {subjects.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <span className="muted small">Только опубликованные результаты</span>
          </FilterBar>
          {subjects
            .filter((s) => !subject || s === subject)
            .map((s) => (
              <section key={s} className="stack">
                <div className="section-heading">
                  <h2>{s}</h2>
                </div>
                <div className="results-grid">
                  {results
                    .filter((r) => r.exam.subject === s)
                    .map(({ result, exam }) => (
                      <button className="result-card" key={result.id} onClick={() => setSelected(result.id)}>
                        <div className="between">
                          <span className="badge badge-checked">
                            {exam.format?.toUpperCase() ?? (exam.type === 'ege' ? 'ЕГЭ' : 'Пробник')}
                          </span>
                          <ArrowUpRight size={18} />
                        </div>
                        <h3>{examTitle(exam)}</h3>
                        <span className="exam-date">
                          <CalendarDays size={15} />
                          {date(examDate(exam, result.slot_id))}
                        </span>
                        <div className="result-score">
                          <Award size={25} />
                          <strong>{score(result.test_score ?? result.primary_score)}</strong>
                          <span>{result.test_score == null ? 'первичных баллов' : 'баллов'}</span>
                        </div>
                        <span className="card-link">
                          Посмотреть результат <ArrowUpRight size={16} />
                        </span>
                      </button>
                    ))}
                </div>
              </section>
            ))}
        </>
      ) : (
        <div className="panel">
          <EmptyState
            title="Ваша история результатов начинается здесь"
            text="После публикации преподавателем вы увидите баллы по заданиям и рекомендации. Пока работа проверяется, результат скрыт."
          />
        </div>
      )}
      {current && (
        <Modal title="Подробный результат" onClose={() => setSelected(undefined)} wide>
          <div className="modal-body">
            <ResultDetails result={current.result} exam={current.exam} />
          </div>
        </Modal>
      )}
    </div>
  );
}
