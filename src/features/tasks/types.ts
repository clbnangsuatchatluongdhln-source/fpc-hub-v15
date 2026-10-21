/* ============================================================
   FPC HUB v15 · Module 5 · Types
   ============================================================ */

export type TaskStatus =
  | 'assigned'
  | 'working'
  | 'pending_review'
  | 'approved'
  | 'rejected';

export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TaskFilter = 'all' | TaskStatus;

export type SubtaskStatus = 'todo' | 'doing' | 'submitted' | 'scored';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export type UserRole = 'super_admin' | 'admin' | 'member' | 'viewer';
export type ApprovalStatus = 'pending' | 'active' | 'rejected';

/* ── Hồ sơ người dùng (rút gọn cho module task) ── */
export interface Profile {
  id: string;
  email: string;
  display_name: string;
  avatar_color: string;
  role: UserRole;
  status: string;
  approval_status: ApprovalStatus;
}

export interface Department {
  id: string;
  name: string;
  head_id: string | null;
  icon?: string | null;
  color?: string | null;
}

export interface ProjectOption {
  id: string;
  name: string;
}

/* ── Task lớn ── */
export interface Task {
  id: string;
  title: string;
  description: string | null;
  requirement: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  department_id: string;
  project_id: string | null;
  start_date: string | null;
  deadline_original: string | null;
  deadline_current: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  reject_count: number;
  created_at: string;
  updated_at: string;
}

/* ── Subtask ── */
export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  description: string | null;
  assignee_id: string;
  deadline: string | null;
  order_index: number;
  status: SubtaskStatus;
  created_by: string | null;
  submitted_at: string | null;
  created_at: string;
}

/* ── Submission của từng thành viên ── */
export interface Submission {
  id: string;
  subtask_id: string;
  member_id: string;
  file_url: string;
  file_name: string;
  file_size: number;
  note: string | null;
  is_rejected: boolean;
  is_late: boolean;
  late_days: number;
  score: number | null;
  contribution_pct: number | null;
  head_note: string | null;
  scored_by: string | null;
  scored_at: string | null;
  submitted_at: string;
}

/* ── File nghiệm thu cuối (do Trưởng ban chọn) ── */
export interface FinalFile {
  url: string;
  name: string;
  size?: number;
}

/* ── Bảng điểm do Trưởng ban tổng hợp ── */
export interface ScoreboardEntry {
  user_id: string;
  name: string;
  score: number;
  contribution_pct: number;
  role: string;
}

/* ── Task submission (nộp lên Chủ nhiệm) ── */
export interface TaskSubmission {
  id: string;
  task_id: string;
  head_id: string;
  final_files: FinalFile[];
  summary: string | null;
  scoreboard: ScoreboardEntry[];
  status: ReviewStatus;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  president_note: string | null;
}

/* ── Audit log input ── */
export interface TaskHistoryInput {
  task_id: string;
  action: string;
  old_status?: string | null;
  new_status?: string | null;
  note?: string;
  metadata?: Record<string, unknown>;
}

/* ── Audit log row (raw từ bảng task_history) ── */
export interface TaskHistory {
  id: string;
  task_id: string;
  action: string;
  actor_id: string | null;
  old_status: string | null;
  new_status: string | null;
  note: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/* ── Input models ── */
export interface CreateTaskInput {
  title: string;
  description: string;
  requirement: string;
  department_id: string;
  priority: TaskPriority;
  start_date: string | null;
  deadline: string;
  project_id: string | null;
  created_by: string;
}

export interface UpdateTaskInput {
  title: string;
  description: string;
  requirement: string;
  department_id: string;
  priority: TaskPriority;
  start_date: string | null;
  deadline: string;
  project_id: string | null;
}

export interface CreateSubtaskInput {
  task_id: string;
  title: string;
  description: string | null;
  assignee_id: string;
  deadline: string;
  order_index: number;
  created_by: string | null;
}

export interface UploadedFile {
  url: string;
  name: string;
  size: number;
}
