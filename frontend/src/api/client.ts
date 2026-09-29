import type {
  Exam,
  ExamCreate,
  ExamEvent,
  ExamEventCreate,
  Group,
  ImportPreview,
  ImportAnalysis,
  Membership,
  Participation,
  QuickResultWrite,
  ResultWrite,
  Session,
  Status,
  Student,
  StudentParticipation,
  SubjectSetting,
  SubjectSettingWrite,
  Teacher,
  TeacherWrite,
} from '../types';

let token = '';
export function setApiToken(value: string) {
  token = value;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...options, headers });
  } catch {
    throw new Error('Не удалось связаться с сервером. Проверьте, что приложение запущено.');
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const detail = error.detail;
    throw new Error(
      Array.isArray(detail)
        ? detail
            .map((e: { loc: string[]; msg: string }) => `${e.loc.slice(1).join('.')}: ${e.msg}`)
            .join('; ')
        : typeof detail === 'string'
          ? detail
          : `Не удалось выполнить запрос (${response.status})`,
    );
  }
  return response.json();
}

async function all<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = await request<T[]>(`${path}${path.includes('?') ? '&' : '?'}limit=500&offset=${offset}`);
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
const importFile = <T>(path: string, file: File, grades?: (number | null)[], confirmation?: string) => {
  const body = new FormData();
  body.append('file', file);
  if (confirmation) body.append('confirmation', confirmation);
  if (grades) body.append('grades', JSON.stringify(grades));
  return request<T>(`/imports/${path}`, { method: 'POST', body });
};

export const api = {
  session: () => request('/session'),
  students: { list: () => all<Student>('/students') },
  groups: { list: () => all<Group>('/groups') },
  teachers: {
    list: () => all<Teacher>('/teachers'),
    create: (data: TeacherWrite) => request<Teacher>('/teachers', json('POST', data)),
    update: (id: number, data: TeacherWrite) =>
      request<Teacher>(`/teachers/${id}`, json('PUT', data)),
    delete: (id: number) => request<{ ok: boolean }>(`/teachers/${id}`, { method: 'DELETE' }),
  },
  subjects: {
    list: () => all<SubjectSetting>('/subjects'),
    create: (data: SubjectSettingWrite) =>
      request<SubjectSetting>('/subjects', json('POST', data)),
    update: (id: number, data: SubjectSettingWrite) =>
      request<SubjectSetting>(`/subjects/${id}`, json('PUT', data)),
    delete: (id: number) => request<{ ok: boolean }>(`/subjects/${id}`, { method: 'DELETE' }),
  },
  memberships: { list: () => all<Membership>('/memberships') },
  exams: {
    list: () => all<Exam>('/exams'),
    create: (data: ExamCreate) => request<Exam>('/exams', json('POST', data)),
  },
  participations: {
    // Registration is tied to a subject and, for scheduled events, a school/time.
    list: () => all<Participation>('/participations'),
    register: (student_id: number, exam_id: number, slot_id?: number) =>
      request<Participation>('/participations', json('POST', { student_id, exam_id, slot_id })),
    updateStatus: (id: number, status: Status) =>
      request<Participation>(`/participations/${id}/status`, json('PATCH', { status })),
  },
  results: {
    quickSave: (data: QuickResultWrite) =>
      request<Participation>('/participations/quick-result', json('POST', data)),
    save: (id: number, data: ResultWrite) =>
      request<Participation>(`/participations/${id}/result`, json('PUT', data)),
    publish: (id: number, data: ResultWrite) =>
      request<Participation>(`/participations/${id}/publish`, json('POST', data)),
  },
  examEvents: {
    create: (data: ExamEventCreate) => request<ExamEvent>('/exam-events', json('POST', data)),
    update: (id: number, data: ExamEventCreate) =>
      request<ExamEvent>(`/exam-events/${id}`, json('PUT', data)),
    delete: (id: number) => request<{ ok: boolean }>(`/exam-events/${id}`, { method: 'DELETE' }),
  },
  import: {
    analyze: (file: File) => importFile<ImportAnalysis>('analyze', file),
    preview: (file: File, grades: (number | null)[]) => importFile<ImportPreview>('preview', file, grades),
    apply: (file: File, confirmation: string, grades: (number | null)[]) =>
      importFile<ImportPreview>('apply', file, grades, confirmation),
  },
  student: {
    login: (last_name: string, first_name: string) =>
      request<{ token: string; student: Student }>('/student/login', json('POST', { last_name, first_name })),
    me: () => request<Student>('/student/me'),
    exams: () => all<Exam>('/student/exams'),
    participations: () => all<StudentParticipation>('/student/participations'),
    results: () => all<Participation>('/student/results'),
    register: (id: number, slot_id?: number) =>
      request<StudentParticipation>(`/student/exams/${id}/register`, json('POST', { slot_id })),
    updateRegistration: (id: number, slot_id: number) =>
      request<StudentParticipation>(`/student/participations/${id}`, json('PATCH', { slot_id })),
    cancelRegistration: (id: number) =>
      request<StudentParticipation>(`/student/participations/${id}`, { method: 'DELETE' }),
  },
  teacher: {
    login: (first_name: string, middle_name: string) =>
      request<{ token: string; teacher: { id: number; name: string } }>(
        '/teacher/login',
        json('POST', { first_name, middle_name }),
      ),
  },
};

export function saveSession(session: Session | null) {
  setApiToken(session?.token ?? '');
  if (session) sessionStorage.setItem('probnik-session', JSON.stringify(session));
  else sessionStorage.removeItem('probnik-session');
}

export function loadSession(): Session | null {
  const localKey = new URLSearchParams(location.hash.slice(1)).get('local-key');
  if (localKey) {
    history.replaceState(null, '', location.pathname);
    const session: Session = { token: localKey, role: 'admin', name: 'Локальный администратор' };
    saveSession(session);
    return session;
  }
  try {
    const session = JSON.parse(sessionStorage.getItem('probnik-session') ?? 'null') as Session | null;
    if (
      session &&
      (!['admin', 'responsible', 'teacher', 'student'].includes(session.role) ||
        !session.token ||
        (session.role === 'teacher' &&
          (!session.teacherId || !session.token.startsWith('teacher.'))))
    )
      return null;
    setApiToken(session?.token ?? '');
    return session;
  } catch {
    return null;
  }
}
