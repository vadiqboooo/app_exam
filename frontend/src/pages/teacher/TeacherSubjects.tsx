import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { api, loadSession } from '../../api/client';
import { EmptyState } from '../../components/EmptyState';
import { ErrorNotice } from '../../components/ErrorNotice';
import { useLoad } from '../../hooks/useLoad';
import type { SubjectSetting } from '../../types';

type Filter = 'Мои' | 'ЕГЭ' | 'ОГЭ' | '10 класс' | 'Точные науки' | 'Гуманитарные' | 'Естественные';
type Category = 'Точные науки' | 'Гуманитарные' | 'Естественные';
type SubjectCard = { subject: SubjectSetting; sections: number; topics: string };
const filters: Filter[] = ['Мои', 'ЕГЭ', 'ОГЭ', '10 класс', 'Точные науки', 'Гуманитарные', 'Естественные'];

function categoryOf(name: string): Category {
  const value = name.toLocaleLowerCase('ru');
  if (/математ|информат|физик/.test(value)) return 'Точные науки';
  if (/биолог|хими|географ|эколог/.test(value)) return 'Естественные';
  return 'Гуманитарные';
}

function paletteOf(name: string) {
  const value = name.toLocaleLowerCase('ru');
  if (/математ/.test(value)) return 'violet';
  if (/русск|литератур/.test(value)) return 'rose';
  if (/информат/.test(value)) return 'teal';
  if (/обществ|истор/.test(value)) return 'amber';
  if (/физик|географ/.test(value)) return 'blue';
  return 'green';
}

function SubjectArt({ name }: { name: string }) {
  const value = name.toLocaleLowerCase('ru');
  if (/математ/.test(value)) return <svg className="ts-art" viewBox="0 0 170 96" aria-hidden="true"><path d="M8 74H162M88 8V88M15 77C48 80 58 16 88 16c27 0 39 63 73 61" fill="none" stroke="currentColor" strokeWidth="2" /><text x="119" y="40">x²</text><text x="11" y="46">∫</text></svg>;
  if (/русск|литератур/.test(value)) return <svg className="ts-art" viewBox="0 0 170 96" aria-hidden="true"><text x="12" y="70" className="ts-art-large">Аа</text><path d="M10 77c46-22 95 17 150-9" fill="none" stroke="currentColor" strokeWidth="2" /></svg>;
  if (/информат/.test(value)) return <svg className="ts-art" viewBox="0 0 170 96" aria-hidden="true"><rect x="18" y="12" width="133" height="66" rx="8" fill="none" stroke="currentColor" strokeWidth="2" /><text x="35" y="59">&lt;/&gt;_</text><path d="M73 79v8m-20 0h40" fill="none" stroke="currentColor" strokeWidth="2" /></svg>;
  if (/обществ|истор/.test(value)) return <svg className="ts-art" viewBox="0 0 170 96" aria-hidden="true"><path d="M15 38L85 12l70 26M18 42h134M22 80h126M30 45v31m25-31v31m30-31v31m30-31v31m25-31v31" fill="none" stroke="currentColor" strokeWidth="2" /></svg>;
  if (/физик/.test(value)) return <svg className="ts-art" viewBox="0 0 170 96" aria-hidden="true"><ellipse cx="85" cy="48" rx="62" ry="23" transform="rotate(28 85 48)" fill="none" stroke="currentColor" strokeWidth="2" /><ellipse cx="85" cy="48" rx="62" ry="23" transform="rotate(-28 85 48)" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="85" cy="48" r="6" fill="currentColor" /></svg>;
  return <svg className="ts-art" viewBox="0 0 170 96" aria-hidden="true"><path d="M82 82c-17-26-15-55 8-67 13 22 8 43-8 67Zm1-8c4-25 20-39 55-45-2 29-21 46-55 45Z" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M82 82c10-20 24-35 44-43" fill="none" stroke="currentColor" strokeWidth="2" /></svg>;
}

const loadSubjects = async (): Promise<SubjectCard[]> => {
  const subjects = await api.subjects.list();
  return Promise.all(subjects.map(async (subject) => {
    const program = await api.subjects.program.get(subject.id).catch(() => null);
    return {
      subject,
      sections: program?.sections.length ?? 0,
      topics: program?.sections.flatMap((section) => section.topics.map((topic) => topic.title)).join(' ') ?? '',
    };
  }));
};

export function TeacherSubjects() {
  const { data, error, loading } = useLoad(loadSubjects);
  const staffId = loadSession()?.staffId ?? loadSession()?.teacherId;
  const [query, setQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<Filter[]>([]);
  const toggle = (filter: Filter) => setActiveFilters((current) => current.includes(filter) ? current.filter((item) => item !== filter) : [...current, filter]);
  const needle = query.trim().toLocaleLowerCase('ru');
  const visible = (data ?? []).filter(({ subject, topics }) => {
    const mine = staffId != null && subject.responsible_id === staffId;
    const formats = activeFilters.filter((item) => ['ЕГЭ', 'ОГЭ', '10 класс'].includes(item));
    const categories = activeFilters.filter((item): item is Category => ['Точные науки', 'Гуманитарные', 'Естественные'].includes(item));
    return (!needle || `${subject.name} ${topics}`.toLocaleLowerCase('ru').includes(needle))
      && (!activeFilters.includes('Мои') || mine)
      && (!formats.length || formats.includes(subject.format === 'ege' ? 'ЕГЭ' : 'ОГЭ'))
      && (!categories.length || categories.includes(categoryOf(subject.name)));
  });

  return <div className="ad-page ts-page">
    <div className="ts-intro"><h1>Предметы</h1></div>
    <label className="ts-search"><Search size={18} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Предмет или тема, например «логарифмы»" aria-label="Поиск по предметам" />{query && <button type="button" onClick={() => setQuery('')} aria-label="Очистить поиск"><X size={18} /></button>}</label>
    <div className="ts-filter-chips" role="group" aria-label="Фильтры предметов">{filters.map((filter) => <button type="button" key={filter} className={activeFilters.includes(filter) ? 'selected' : ''} aria-pressed={activeFilters.includes(filter)} onClick={() => toggle(filter)}>{filter}</button>)}</div>
    <ErrorNotice message={error} />
    {loading && !data ? <div className="loading" role="status">Загружаем предметы…</div> : data?.length ? <div className="ts-grid">
      {visible.map(({ subject, sections }) => {
        const mine = staffId != null && subject.responsible_id === staffId;
        return <Link key={subject.id} className={`ts-card ${paletteOf(subject.name)}`} to={`/subjects/${subject.id}`} aria-label={`${subject.name}, ${subject.format === 'ege' ? 'ЕГЭ' : 'ОГЭ'}${mine ? ', вы ответственный' : ''}`}>
          <SubjectArt name={subject.name} />
          {mine && <span className="ts-responsible">✓ Ответственный</span>}
          <strong className="ts-card-title">{subject.name}</strong>
          <span className="ts-card-meta"><span className="ts-format">{subject.format === 'ege' ? 'ЕГЭ' : 'ОГЭ'}</span><span>{sections} {sections === 1 ? 'раздел' : sections < 5 ? 'раздела' : 'разделов'}</span></span>
        </Link>;
      })}
      {!visible.length && <p className="ts-no-results">Ничего не нашлось. Попробуйте другое слово или снимите фильтры.</p>}
    </div> : <div className="panel"><EmptyState title="Предметы пока не добавлены" text="Программы появятся здесь после добавления предметов." /></div>}
  </div>;
}
