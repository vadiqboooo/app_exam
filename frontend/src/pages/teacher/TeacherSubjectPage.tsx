import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Settings2 } from 'lucide-react';
import { api, loadSession } from '../../api/client';
import { ErrorNotice } from '../../components/ErrorNotice';
import { SubjectEditor } from '../../components/SubjectEditor';
import { SubjectProgram } from '../../components/SubjectProgram';
import { useLoad } from '../../hooks/useLoad';

export function TeacherSubjectPage() {
  const { id } = useParams();
  const subjectId = Number(id);
  const [view, setView] = useState<'program' | 'settings'>('program');
  const [editingProgram, setEditingProgram] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
  const load = useCallback(async () => {
    const [subjects, program] = await Promise.all([
      api.subjects.list(),
      api.subjects.program.get(subjectId),
    ]);
    const subject = subjects.find((item) => item.id === subjectId);
    if (!subject) throw new Error('Предмет не найден');
    return { subject, program };
  }, [subjectId]);
  const { data, error, loading, refresh } = useLoad(load);
  const staffId = loadSession()?.staffId ?? loadSession()?.teacherId;
  const isResponsible = data?.subject.responsible_id != null && data.subject.responsible_id === staffId;
  useEffect(() => { setView('program'); setEditingProgram(false); setSelectedTopicId(null); }, [subjectId]);

  if (loading && !data) return <div className="loading" role="status">Загружаем предмет…</div>;
  if (error && !data) return <div className="ad-page"><ErrorNotice message={error} /></div>;
  if (!data) return null;

  return (
    <div className="ad-page sp-subject-page">
      <div className="sp-subject-head">
        {selectedTopicId === null
          ? <Link className="sb-back" to="/subjects"><ArrowLeft size={18} /> Предметы</Link>
          : <button type="button" className="sb-back" onClick={() => setSelectedTopicId(null)}><ArrowLeft size={18} /> К программе</button>}
        <div className="sp-subject-title">
          <h1>{data.subject.name}</h1>
          <span className="sc-format">{data.subject.format === 'ege' ? 'ЕГЭ' : 'ОГЭ'}</span>
          {isResponsible && <span className="sb-mine">Вы ответственный</span>}
        </div>
        {selectedTopicId === null && <div className="sp-subject-actions">
          {view === 'settings' ? (
            <button type="button" className="sp-head-action" onClick={() => setView('program')}><ArrowLeft size={16} /> К программе</button>
          ) : <>
            {isResponsible && <button type="button" className="sp-head-action" disabled={editingProgram} onClick={() => setView('settings')}><Settings2 size={16} /> Настройка предмета</button>}
            {data.program.can_edit && <button type="button" className="sp-head-action" disabled={editingProgram} onClick={() => setEditingProgram(true)}><Pencil size={16} /> {data.program.sections.length ? 'Редактировать программу' : 'Создать программу'}</button>}
          </>}
        </div>}
      </div>
      <ErrorNotice message={error} />
      {view === 'program' || !isResponsible ? (
        <SubjectProgram key={subjectId} program={data.program} onSaved={refresh} editing={editingProgram} onEditingChange={setEditingProgram} selectedTopicId={selectedTopicId} onSelectTopic={setSelectedTopicId} />
      ) : (
        <SubjectEditor mode="teacher" subjectId={subjectId} backTo="/subjects" embedded onClose={() => setView('program')} onSaved={refresh} />
      )}
    </div>
  );
}
