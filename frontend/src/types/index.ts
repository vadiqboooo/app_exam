export type Role = 'admin' | 'responsible' | 'teacher' | 'student';
export type Status =
  'registered' | 'attended' | 'submitted' | 'checked' | 'published' | 'absent' | 'cancelled';
export type StaffRole = 'admin' | 'responsible' | 'teacher';
export interface Session {
  role: Role;
  name: string;
  token: string;
  studentId?: number;
  /** Set for an employee who teaches: the same id as `staffId`. */
  teacherId?: number;
  /** Employee id when the person signed in with a personal code. */
  staffId?: number;
  /** All roles of a signed-in employee; `role` is the highest of them. */
  roles?: StaffRole[];
}
export interface Student {
  id: number;
  full_name: string;
  grade: number | null;
  is_active: boolean;
  external_id: string | null;
  name_key: string;
  has_code?: boolean;
  locked_until?: string | null;
  last_login_at?: string | null;
}
/** A pupil found by name among all pupils, with their groups and the work on a chosen exam. */
export interface StudentCandidate {
  id: number;
  full_name: string;
  grade: number | null;
  groups: { source_name: string; teacher_name: string | null }[];
  status: Status | null;
}
export interface Group {
  id: number;
  source_name: string;
  display_name: string;
  teacher_name: string | null;
  schedule: string | null;
  subject: string | null;
  exam_format: 'ege' | 'oge' | null;
  teacher_id: number | null;
  is_active: boolean;
  /** Tasks of each exam the group has already covered in class. */
  coverage: { exam_id: number; task_codes: string[] }[];
}
export interface Teacher {
  id: number;
  name: string;
  first_name: string;
  middle_name: string;
  roles: StaffRole[];
  group_ids: number[];
  has_code: boolean;
  locked_until: string | null;
  last_login_at: string | null;
}
export interface TeacherWrite {
  first_name: string;
  middle_name: string;
  group_ids: number[];
  /** Only sent when creating an employee. */
  roles?: StaffRole[];
}
export interface Membership {
  id: number;
  student_id: number;
  group_id: number;
  started_at: string;
  ended_at: string | null;
}
export interface Task {
  code: string;
  title: string;
  max_score: number;
}
export interface GradeRange {
  grade: number;
  min: number;
  max: number;
}
export interface SubjectSetting {
  id: number;
  name: string;
  format: 'ege' | 'oge';
  tasks: Task[];
  primary_to_secondary_scale: number[] | null;
  grade_scale: GradeRange[] | null;
  is_active: boolean;
  max_primary_score: number;
  duration_minutes: number | null;
  responsible_id: number | null;
  responsible_name: string | null;
  responsible_since: string | null;
  variants_count: number;
}
export interface SubjectSettingWrite {
  name: string;
  format: 'ege' | 'oge';
  tasks: Task[];
  primary_to_secondary_scale: number[] | null;
  grade_scale: GradeRange[] | null;
  is_active: boolean;
  // Left out, these keep their stored value (the active switch of the list sends neither).
  duration_minutes?: number | null;
  responsible_id?: number | null;
}
export type SubjectContentWrite = Pick<
  SubjectSettingWrite,
  'tasks' | 'primary_to_secondary_scale' | 'grade_scale'
>;
export interface SubjectVariant {
  id: number;
  subject_id: number;
  name: string;
  filename: string;
  content_type: string;
  size: number;
  uploaded_at: string;
  /** Exam events this variant is printed for. */
  event_ids: number[];
}
export interface Exam {
  id: number;
  event_id: number | null;
  format: 'ege' | 'oge' | null;
  slots: ExamSlot[];
  type: 'mock' | 'ege';
  subject: string;
  title: string | null;
  wave: string | null;
  starts_at: string;
  ends_at: string | null;
  registration_open_at: string | null;
  registration_close_at: string | null;
  structure_data: {
    version: 1;
    tasks: Task[];
    primary_to_secondary_scale?: number[] | null;
    grade_scale?: GradeRange[] | null;
  } | null;
  is_active: boolean;
}
export interface ExamSlot {
  id: number;
  school_id: number;
  school_name: string;
  school_address: string | null;
  starts_at: string;
  capacity: number;
  booked: number;
  remaining: number;
}
export interface ExamEventCreate {
  title: string;
  draft?: boolean;
  registration_open_at: string | null;
  registration_close_at: string | null;
  schools: {
    id?: number;
    name: string;
    address: string | null;
    slots: { id?: number; starts_at: string; capacity: number }[];
  }[];
  subjects: {
    id?: number;
    format: 'ege' | 'oge';
    subject: string;
    structure_data: Exam['structure_data'];
  }[];
}
export interface ExamEvent {
  id: number;
  title: string;
  exam_ids: number[];
}
export type ExamCreate = Omit<Exam, 'id' | 'event_id' | 'format' | 'slots'>;
export interface TaskResult {
  code: string;
  score: number;
  comment: string;
}
export interface ResultData {
  version: 1;
  tasks: TaskResult[];
  overall_comment: string;
}
export interface ResultWrite {
  primary_score: number;
  test_score: number | null;
  result_data: ResultData | null;
}
export interface QuickResultWrite extends ResultWrite {
  student_id: number;
  exam_id: number;
  slot_id?: number;
}
export interface Participation extends ResultWrite {
  id: number;
  student_id: number;
  exam_id: number;
  slot_id: number | null;
  status: Status;
  updated_at: string;
  published_at: string | null;
  checked_by: string | null;
  /** What to tell the student and the parent; kept for staff only. */
  feedback: string | null;
  parent_status: ParentStatus;
}
export type ParentStatus = 'none' | 'sent' | 'got';
export type StudentParticipation = Pick<Participation, 'id' | 'exam_id' | 'slot_id' | 'status'>;
export interface Workspace {
  students: Student[];
  groups: Group[];
  memberships: Membership[];
  exams: Exam[];
  participations: Participation[];
}
export interface StudentWorkspace {
  student: Student;
  exams: Exam[];
  participations: StudentParticipation[];
  results: Participation[];
}
export type ChangeKey =
  'unchanged' | 'new' | 'returned' | 'left' | 'updated' | 'changed_groups' | 'new_groups' | 'new_teachers';
export interface ImportPreview {
  confirmation: string;
  applied: boolean;
  report: Record<ChangeKey | 'total' | 'memberships_added' | 'memberships_closed', number>;
  changes: Partial<Record<ChangeKey, { full_name: string; before?: string[]; after?: string[] }[]>>;
}
export interface TeachersStep {
  total: number;
  new: number;
  unchanged: number;
  rows: { name: string; subjects: string; groups: number; status: 'new' | 'unchanged' }[];
}
export interface GroupsStep {
  total: number;
  new: number;
  with_teacher: number;
  without_teacher: number;
  rows: { name: string; subject: string; teacher: string; status: 'new' | 'unchanged' | 'no_teacher' }[];
}
export type StudentStatus =
  'new' | 'returned' | 'left' | 'changed_groups' | 'updated' | 'unchanged' | 'unknown_group';
export interface StudentsStep {
  total: number;
  new: number;
  returned: number;
  changed_groups: number;
  left: number;
  unknown_group: number;
  unchanged: number;
  rows: { name: string; grade: number | null; groups: string; status: StudentStatus }[];
}
export interface LegacyStep {
  title: string | null;
  subjects: number;
  works: number;
  students: number;
}
export interface BackupObject {
  name: string;
  size: number;
  created: string;
}
export interface LegacyFile extends BackupObject {
  /** A copy of the current version: shown, but it cannot be chosen as the previous one. */
  current: boolean;
}
export interface LegacyFiles {
  configured: boolean;
  files: LegacyFile[];
  error?: string;
}
export interface BackupState {
  configured: boolean;
  bucket?: string | null;
  latest?: BackupObject | null;
  stale?: boolean;
  backups?: BackupObject[];
  /** The cloud could not be asked; the import itself is not blocked. */
  error?: string;
  drive?: DriveState;
  webdav?: WebDavState;
  folder?: FolderState;
  yandex?: YandexState;
}
export interface YandexState {
  connected: boolean;
  where: string | null;
  /** The Yandex OAuth app id set on the server; when present the person need not type it. */
  client_id: string | null;
}
export interface FolderState {
  connected: boolean;
  path: string | null;
}
export interface WebDavState {
  connected: boolean;
  host: string | null;
  folder: string | null;
}
export interface DriveState {
  client_configured: boolean;
  connected: boolean;
  folder_name: string | null;
  /** The address to register in the Google OAuth client. */
  redirect_uri: string;
}
export interface ImportRun {
  confirmation: string;
  applied: boolean;
  backup?: BackupState;
  warnings: { n: string; text: string }[];
  report: {
    teachers: { total: number; new: number } | null;
    groups: { total: number; new: number; without_teacher: number } | null;
    students: {
      total: number;
      new: number;
      left: number;
      changed_groups: number;
      unknown_groups: number;
    } | null;
    legacy: { works: number; linked: number; unlinked: number; already: number; students: number } | null;
  };
}
export interface ImportAnalysis {
  total: number;
  grades: { grade: number | null; count: number }[];
}
