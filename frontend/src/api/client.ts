import type {
  Exam,
  ExamCreate,
  ExamEvent,
  ExamEventCreate,
  Group,
  GroupsStep,
  ImportPreview,
  ImportAnalysis,
  ImportRun,
  LegacyStep,
  Membership,
  Participation,
  QuickResultWrite,
  ResultWrite,
  Session,
  Status,
  Student,
  StudentCandidate,
  StudentParticipation,
  StudentsStep,
  SubjectContentWrite,
  SubjectSetting,
  SubjectSettingWrite,
  SubjectVariant,
  ParentStatus,
  StaffRole,
  Teacher,
  TeacherWrite,
  TeachersStep,
} from '../types';

export type CodeStep = { status: 'code_new' | 'code_required' };
export type StudentLoginResult = CodeStep | { status: 'ok'; token: string; student: Student };
export type TeacherLoginResult =
  CodeStep | { status: 'ok'; token: string; teacher: { id: number; name: string; roles: StaffRole[] } };

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

const importForm = <T>(path: string, parts: Record<string, File | string | undefined>) => {
  const body = new FormData();
  for (const [name, value] of Object.entries(parts)) if (value !== undefined) body.append(name, value);
  return request<T>(`/imports/${path}`, { method: 'POST', body });
};

export const api = {
  session: () => request('/session'),
  students: {
    list: () => all<Student>('/students'),
    search: (query: string, examId?: number) =>
      request<StudentCandidate[]>(
        `/students/search?q=${encodeURIComponent(query)}${examId ? `&exam_id=${examId}` : ''}`,
      ),
    resetCode: (id: number) => request<Student>(`/students/${id}/reset-code`, { method: 'POST' }),
    unlock: (id: number) => request<Student>(`/students/${id}/unlock`, { method: 'POST' }),
  },
  groups: { list: () => all<Group>('/groups') },
  teachers: {
    list: () => all<Teacher>('/teachers'),
    create: (data: TeacherWrite) => request<Teacher>('/teachers', json('POST', data)),
    update: (id: number, data: TeacherWrite) => request<Teacher>(`/teachers/${id}`, json('PUT', data)),
    setRoles: (id: number, roles: StaffRole[]) =>
      request<Teacher>(`/teachers/${id}/roles`, json('PUT', { roles })),
    delete: (id: number) => request<{ ok: boolean }>(`/teachers/${id}`, { method: 'DELETE' }),
    resetCode: (id: number) => request<Teacher>(`/teachers/${id}/reset-code`, { method: 'POST' }),
    unlock: (id: number) => request<Teacher>(`/teachers/${id}/unlock`, { method: 'POST' }),
  },
  subjects: {
    list: () => all<SubjectSetting>('/subjects'),
    mine: () => request<SubjectSetting[]>('/subjects/mine'),
    updateContent: (id: number, data: SubjectContentWrite) =>
      request<SubjectSetting>(`/subjects/${id}/content`, json('PUT', data)),
    variants: {
      list: (id: number) => request<SubjectVariant[]>(`/subjects/${id}/variants`),
      upload: (id: number, files: File[], eventIds: number[] = []) => {
        const body = new FormData();
        for (const file of files) body.append('files', file);
        for (const eventId of eventIds) body.append('event_ids', String(eventId));
        return request<SubjectVariant[]>(`/subjects/${id}/variants`, { method: 'POST', body });
      },
      setEvents: (variantId: number, event_ids: number[]) =>
        request<SubjectVariant>(`/subjects/variants/${variantId}/events`, json('PUT', { event_ids })),
      rename: (variantId: number, name: string) =>
        request<SubjectVariant>(`/subjects/variants/${variantId}`, json('PATCH', { name })),
      replace: (variantId: number, file: File) => {
        const body = new FormData();
        body.append('file', file);
        return request<SubjectVariant>(`/subjects/variants/${variantId}/file`, { method: 'PUT', body });
      },
      remove: (variantId: number) =>
        request<{ ok: boolean }>(`/subjects/variants/${variantId}`, { method: 'DELETE' }),
      blob: async (variant: SubjectVariant) => {
        const response = await fetch(`/api/subjects/variants/${variant.id}/download`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) throw new Error('Не удалось скачать файл');
        return response.blob();
      },
      download: async (variant: SubjectVariant) => {
        const url = URL.createObjectURL(await api.subjects.variants.blob(variant));
        const link = document.createElement('a');
        link.href = url;
        link.download = variant.filename;
        link.click();
        URL.revokeObjectURL(url);
      },
    },
    create: (data: SubjectSettingWrite) => request<SubjectSetting>('/subjects', json('POST', data)),
    update: (id: number, data: SubjectSettingWrite) =>
      request<SubjectSetting>(`/subjects/${id}`, json('PUT', data)),
    delete: (id: number) => request<{ ok: boolean }>(`/subjects/${id}`, { method: 'DELETE' }),
  },
  memberships: {
    list: () => all<Membership>('/memberships'),
    add: (student_id: number, group_id: number) =>
      request<Membership>('/memberships', json('POST', { student_id, group_id })),
    remove: (id: number) => request<Membership>(`/memberships/${id}`, { method: 'DELETE' }),
  },
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
    saveFeedback: (
      participation_ids: number[],
      data: { feedback?: string | null; parent_status?: ParentStatus },
    ) => request<Participation[]>('/participations/feedback', json('PUT', { participation_ids, ...data })),
  },
  examEvents: {
    create: (data: ExamEventCreate) => request<ExamEvent>('/exam-events', json('POST', data)),
    update: (id: number, data: ExamEventCreate) =>
      request<ExamEvent>(`/exam-events/${id}`, json('PUT', data)),
    delete: (id: number) => request<{ ok: boolean }>(`/exam-events/${id}`, { method: 'DELETE' }),
  },
  import: {
    teachers: (file: File, groups?: File) => importForm<TeachersStep>('teachers/preview', { file, groups }),
    groups: (file: File, teachers?: File) => importForm<GroupsStep>('groups/preview', { file, teachers }),
    students: (file: File, groups?: File) => importForm<StudentsStep>('students/preview', { file, groups }),
    legacy: (file: File) => importForm<LegacyStep>('legacy/analyze', { file }),
    run: (files: { teachers?: File; groups?: File; students?: File; legacy?: File }, confirmation?: string) =>
      importForm<ImportRun>(confirmation ? 'run/apply' : 'run/preview', { ...files, confirmation }),
    analyze: (file: File) => importFile<ImportAnalysis>('analyze', file),
    preview: (file: File, grades: (number | null)[]) => importFile<ImportPreview>('preview', file, grades),
    apply: (file: File, confirmation: string, grades: (number | null)[]) =>
      importFile<ImportPreview>('apply', file, grades, confirmation),
  },
  student: {
    login: (last_name: string, first_name: string, code?: string) =>
      request<StudentLoginResult>('/student/login', json('POST', { last_name, first_name, code })),
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
    login: (first_name: string, middle_name: string, code?: string) =>
      request<TeacherLoginResult>('/teacher/login', json('POST', { first_name, middle_name, code })),
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
        (session.role === 'teacher' && (!session.teacherId || !session.token.startsWith('teacher.'))))
    )
      return null;
    setApiToken(session?.token ?? '');
    return session;
  } catch {
    return null;
  }
}
