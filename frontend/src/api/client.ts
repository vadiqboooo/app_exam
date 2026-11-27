import type {
  BackupObject,
  BackupState,
  CurrentEvent,
  LegacyFiles,
  YandexState,
  FolderState,
  WebDavState,
  Exam,
  ExamCreate,
  ExamEvent,
  ExamEventCreate,
  Group,
  GroupWrite,
  GroupsStep,
  ImportPreview,
  ImportAnalysis,
  ImportRun,
  LegacyStep,
  Membership,
  Participation,
  QuickResultWrite,
  RosterStep,
  ResultWrite,
  Session,
  Status,
  Student,
  StudentApplication,
  StudentCandidate,
  StudentParticipation,
  StudentsStep,
  SubjectContentWrite,
  SubjectSetting,
  SubjectSettingWrite,
  SubjectProgram,
  ProgramTopicStatus,
  SubjectProgramWrite,
  ProgramMaterial,
  SubjectVariant,
  ParentStatus,
  StaffRole,
  Teacher,
  TeacherWrite,
  TeachersStep,
  Training,
  TrainingPart,
  TrainingTopic,
  TrainingTopicWrite,
  TrainingTeacherProgress,
  ThemeSetting,
  EnabledThemes,
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
  if (response.status === 204) return undefined as T;
  return response.json();
}

async function downloadFile(path: string): Promise<Blob> {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`/api${path}`, { headers });
  if (!response.ok) throw new Error(`Не удалось скачать файл (${response.status})`);
  return response.blob();
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

const importForm = <T>(
  path: string,
  parts: Record<string, File | File[] | string | string[] | undefined>,
) => {
  const body = new FormData();
  for (const [name, value] of Object.entries(parts)) {
    if (Array.isArray(value)) (value as (File | string)[]).forEach((item) => body.append(name, item));
    else if (value !== undefined) body.append(name, value);
  }
  return request<T>(`/imports/${path}`, { method: 'POST', body });
};

export const api = {
  session: () => request('/session'),
  themes: {
    enabled: () => request<EnabledThemes>('/theme-settings'),
    list: () => request<ThemeSetting[]>('/themes'),
  },
  backups: {
    state: () => request<BackupState>('/backups'),
    create: () => request<BackupObject>('/backups', { method: 'POST' }),
    connectDrive: (folder_url: string) =>
      request<{ url: string }>('/backups/drive', json('POST', { folder_url })),
    restore: (name: string) =>
      request<{ restored: string; safety_copy: string }>('/backups/restore', json('POST', { name })),
    legacyFiles: () => request<LegacyFiles>('/backups/legacy'),
    downloadFile: async (name: string) => {
      const response = await fetch(`/api/backups/files/${encodeURIComponent(name)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).catch(() => {
        throw new Error('Не удалось связаться с сервером. Проверьте, что приложение запущено.');
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(
          typeof error.detail === 'string' ? error.detail : `Не удалось взять файл (${response.status})`,
        );
      }
      return response.blob();
    },
    connectYandex: (token: string) => request<YandexState>('/backups/yandex', json('POST', { token })),
    disconnectYandex: () => request<void>('/backups/yandex', { method: 'DELETE' }),
    connectFolder: (path: string) => request<FolderState>('/backups/folder', json('POST', { path })),
    disconnectFolder: () => request<void>('/backups/folder', { method: 'DELETE' }),
    connectWebdav: (login: string, password: string, folder: string) =>
      request<WebDavState>('/backups/webdav', json('POST', { login, password, folder })),
    disconnectWebdav: () => request<void>('/backups/webdav', { method: 'DELETE' }),
    disconnectDrive: () => request<void>('/backups/drive', { method: 'DELETE' }),
  },
  students: {
    list: () => all<Student>('/students'),
    search: (query: string, examId?: number) =>
      request<StudentCandidate[]>(
        `/students/search?q=${encodeURIComponent(query)}${examId ? `&exam_id=${examId}` : ''}`,
      ),
    resetCode: (id: number) => request<Student>(`/students/${id}/reset-code`, { method: 'POST' }),
    unlock: (id: number) => request<Student>(`/students/${id}/unlock`, { method: 'POST' }),
    create: (data: {
      last_name: string;
      first_name: string;
      phone?: string;
      grade: number;
      group_ids: number[];
      give_code: boolean;
    }) => request<{ student: Student; code: string | null }>('/students', json('POST', data)),
    applications: () => request<StudentApplication[]>('/students/applications'),
    approveApplication: (id: number, grade: number, group_id?: number) =>
      request<Student>(`/students/applications/${id}/approve`, json('POST', { grade, group_id })),
    mergeApplication: (id: number, target_id: number) =>
      request<Student>(`/students/applications/${id}/merge`, json('POST', { target_id })),
    update: (
      id: number,
      data: {
        last_name: string;
        first_name: string;
        phone: string | null;
        grade: number | null;
        school: string | null;
      },
    ) => request<Student>(`/students/${id}`, json('PUT', data)),
    archive: (id: number) => request<Student>(`/students/${id}`, { method: 'DELETE' }),
    rejectApplication: (id: number) =>
      request<{ status: string }>(`/students/applications/${id}`, { method: 'DELETE' }),
  },
  groups: {
    list: () => all<Group>('/groups'),
    update: (id: number, data: GroupWrite) => request<Group>(`/groups/${id}`, json('PUT', data)),
    saveCoverage: (groupId: number, examId: number, task_codes: string[]) =>
      request<{ exam_id: number; task_codes: string[] }>(
        `/groups/${groupId}/coverage/${examId}`,
        json('PUT', { task_codes }),
      ),
  },
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
  training: {
    get: () => request<Training>('/training'),
    finish: (part: TrainingPart) => request<Training>(`/training/${part}`, { method: 'POST' }),
    topics: () => request<TrainingTopic[]>('/training/topics'),
    saveProgress: (id: number, data: { video_percent?: number; video_position_seconds?: number; material_read?: boolean }) =>
      request<TrainingTopic>(`/training/topics/${id}/progress`, json('PATCH', data)),
    saveVideoPositionOnExit: (id: number, percent: number, seconds: number) => {
      const token = loadSession()?.token;
      void fetch(`/api/training/topics/${id}/progress`, {
        method: 'PATCH',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ video_percent: percent, video_position_seconds: seconds }),
      }).catch(() => undefined);
    },
    submit: (id: number, answers: Record<number, number[] | string>) =>
      request<{ score: number; total: number; passed: boolean; topic: TrainingTopic }>(
        `/training/topics/${id}/attempts`,
        json('POST', { answers }),
      ),
    adminTopics: () => request<TrainingTopic[]>('/training/admin/topics'),
    createTopic: (data: TrainingTopicWrite) =>
      request<TrainingTopic>('/training/admin/topics', json('POST', data)),
    updateTopic: (id: number, data: TrainingTopicWrite) =>
      request<TrainingTopic>(`/training/admin/topics/${id}`, json('PUT', data)),
    uploadVideo: (id: number, file: File, uploadId: string, onProgress: (percent: number) => void, onUploaded: () => void) =>
      new Promise<{ video_url: string; qualities: number[] }>((resolve, reject) => {
        const body = new FormData();
        body.append('file', file);
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `/api/training/admin/topics/${id}/video`);
        const token = loadSession()?.token;
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('X-Upload-Id', uploadId);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) onProgress(Math.min(100, Math.round(event.loaded / event.total * 100)));
        };
        xhr.upload.onload = onUploaded;
        xhr.onerror = () => reject(new Error('Не удалось передать видео на сервер'));
        xhr.onload = () => {
          let result: { detail?: string; video_url?: string; qualities?: number[] };
          try { result = JSON.parse(xhr.responseText || '{}'); }
          catch { result = {}; }
          if (xhr.status >= 200 && xhr.status < 300 && result.video_url && result.qualities)
            resolve({ video_url: result.video_url, qualities: result.qualities });
          else reject(new Error(typeof result.detail === 'string' ? result.detail : 'Не удалось загрузить видео'));
        };
        xhr.send(body);
      }),
    videoJob: (uploadId: string) => request<{ stage: string; percent: number | null }>(
      `/training/admin/video-jobs/${uploadId}`,
    ),
    deleteVideo: (id: number) => request<TrainingTopic>(`/training/admin/topics/${id}/video`, {
      method: 'DELETE',
    }),
    deleteTopic: (id: number) => request<void>(`/training/admin/topics/${id}`, { method: 'DELETE' }),
    adminProgress: () => request<TrainingTeacherProgress[]>('/training/admin/progress'),
  },
  subjects: {
    list: () => all<SubjectSetting>('/subjects'),
    mine: () => request<SubjectSetting[]>('/subjects/mine'),
    program: {
      get: (id: number) => request<SubjectProgram>(`/subjects/${id}/program`),
      save: (id: number, data: SubjectProgramWrite) =>
        request<SubjectProgram>(`/subjects/${id}/program`, json('PUT', data)),
      setTopicStatus: (id: number, topicId: number, status: ProgramTopicStatus) =>
        request<SubjectProgram>(
          `/subjects/${id}/program/topics/${topicId}/status`,
          json('PATCH', { status }),
        ),
      materials: (id: number, topicId: number) =>
        request<ProgramMaterial[]>(`/subjects/${id}/program/topics/${topicId}/materials`),
      uploadMaterial: (id: number, topicId: number, file: File) => {
        const body = new FormData();
        body.append('file', file);
        return request<ProgramMaterial>(`/subjects/${id}/program/topics/${topicId}/materials`, {
          method: 'POST',
          body,
        });
      },
      deleteMaterial: (id: number, topicId: number, materialId: number) =>
        request<void>(`/subjects/${id}/program/topics/${topicId}/materials/${materialId}`, {
          method: 'DELETE',
        }),
      downloadMaterial: (id: number, topicId: number, materialId: number) =>
        downloadFile(`/subjects/${id}/program/topics/${topicId}/materials/${materialId}/download`),
    },
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
    unpublish: (id: number) => request<Participation>(`/participations/${id}/unpublish`, { method: 'POST' }),
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
    rosters: (files: File[], schools: string[]) =>
      importForm<RosterStep>('rosters/preview', { files, schools }),
    legacy: (file: File) => importForm<LegacyStep>('legacy/analyze', { file }),
    run: (
      files: {
        teachers?: File;
        groups?: File;
        students?: File;
        rosters?: File[];
        schools?: string[];
        legacy?: File;
      },
      confirmation?: string,
    ) => importForm<ImportRun>(confirmation ? 'run/apply' : 'run/preview', { ...files, confirmation }),
    analyze: (file: File) => importFile<ImportAnalysis>('analyze', file),
    preview: (file: File, grades: (number | null)[]) => importFile<ImportPreview>('preview', file, grades),
    apply: (file: File, confirmation: string, grades: (number | null)[]) =>
      importFile<ImportPreview>('apply', file, grades, confirmation),
  },
  student: {
    login: (last_name: string, first_name: string, code?: string) =>
      request<StudentLoginResult>('/student/login', json('POST', { last_name, first_name, code })),
    currentEvent: () => request<CurrentEvent | null>('/student/current-event'),
    signUp: (data: { last_name: string; first_name: string; code: string; phone: string }) =>
      request<{ status: 'ok'; token: string; student: Student }>('/student/register', json('POST', data)),
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
    login: (last_name: string, first_name: string, code?: string) =>
      request<TeacherLoginResult>('/teacher/login', json('POST', { last_name, first_name, code })),
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
