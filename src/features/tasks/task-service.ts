/* ============================================================
   FPC HUB v15 · Module 5 · Task Service (Supabase layer)
   ============================================================ */
import { supabase } from '../../core/supabase';
import type {
  Task, Subtask, Submission, TaskSubmission, TaskHistoryInput, TaskHistory,
  Profile, Department, ProjectOption, CreateTaskInput, UpdateTaskInput,
  CreateSubtaskInput, UploadedFile, FinalFile, ScoreboardEntry, TaskStatus,
} from './types';

const STORAGE_BUCKET = 'files';

/* ─────────────────────────────────────────────
   AUTH / PROFILE CACHE
   ───────────────────────────────────────────── */
let _profile: Profile | null = null;
let _profileLoading: Promise<Profile | null> | null = null;

export async function ensureProfileLoaded(): Promise<Profile | null> {
  if (_profile) return _profile;
  if (_profileLoading) return _profileLoading;

  _profileLoading = (async () => {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, display_name, avatar_color, role, status, approval_status')
      .eq('id', authData.user.id)
      .single();
    if (error || !data) return null;
    _profile = data as Profile;
    return _profile;
  })();

  return _profileLoading;
}

export function getCachedProfile(): Profile | null {
  return _profile;
}

export function clearProfileCache(): void {
  _profile = null;
  _profileLoading = null;
}

/* ─────────────────────────────────────────────
   PERMISSION HELPERS
   ───────────────────────────────────────────── */
export function isSuperAdmin(p: Profile | null): boolean {
  return !!p && p.role === 'super_admin';
}
export function isPresident(p: Profile | null): boolean {
  return !!p && (p.role === 'super_admin' || p.role === 'admin');
}
export function isDeptHead(
  p: Profile | null,
  task: Task,
  departments: Department[],
): boolean {
  if (!p) return false;
  const dept = departments.find(d => d.id === task.department_id);
  return !!dept && dept.head_id === p.id;
}
export function canManageSubtasks(
  p: Profile | null,
  task: Task,
  departments: Department[],
): boolean {
  return isPresident(p) || isDeptHead(p, task, departments);
}

/* ─────────────────────────────────────────────
   LOOKUP DATA
   ───────────────────────────────────────────── */
export async function fetchDepartments(): Promise<Department[]> {
  const { data, error } = await supabase
    .from('departments')
    .select('id, name, head_id, icon, color');
  if (error) throw error;
  return (data ?? []) as Department[];
}

export async function fetchUsers(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, display_name, avatar_color, role, status, approval_status');
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function fetchProjectOptions(): Promise<ProjectOption[]> {
  const { data, error } = await supabase.from('projects').select('id, name');
  if (error) throw error;
  return (data ?? []) as ProjectOption[];
}

/* ─────────────────────────────────────────────
   TASKS
   ───────────────────────────────────────────── */
export async function fetchTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Task[];
}

export async function createTask(input: CreateTaskInput): Promise<void> {
  const { error } = await supabase.from('tasks').insert({
    title: input.title,
    description: input.description || null,
    requirement: input.requirement || null,
    department_id: input.department_id,
    priority: input.priority,
    start_date: input.start_date,
    deadline_original: input.deadline,
    deadline_current: input.deadline,
    status: 'assigned',
    created_by: input.created_by,
    project_id: input.project_id,
  });
  if (error) throw error;
}

export async function updateTask(id: string, input: UpdateTaskInput): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .update({
      title: input.title,
      description: input.description || null,
      requirement: input.requirement || null,
      department_id: input.department_id,
      priority: input.priority,
      start_date: input.start_date,
      deadline_current: input.deadline,
      project_id: input.project_id,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function updateTaskStatus(id: string, status: TaskStatus): Promise<void> {
  const { error } = await supabase.from('tasks').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
}

/* ─────────────────────────────────────────────
   SUBTASKS
   ───────────────────────────────────────────── */
export async function fetchSubtasks(taskId: string): Promise<Subtask[]> {
  const { data, error } = await supabase
    .from('subtasks')
    .select('*')
    .eq('task_id', taskId)
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Subtask[];
}

export async function createSubtask(input: CreateSubtaskInput): Promise<Subtask> {
  const { data, error } = await supabase
    .from('subtasks')
    .insert({
      task_id: input.task_id,
      title: input.title,
      description: input.description || null,
      assignee_id: input.assignee_id,
      deadline: input.deadline,
      order_index: input.order_index,
      status: 'todo',
      created_by: input.created_by,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Subtask;
}

export async function deleteSubtask(id: string): Promise<void> {
  const { error } = await supabase.from('subtasks').delete().eq('id', id);
  if (error) throw error;
}

/* ─────────────────────────────────────────────
   SUBMISSIONS
   ───────────────────────────────────────────── */
export async function fetchSubmissionsBySubtasks(
  subtaskIds: string[],
): Promise<Record<string, Submission[]>> {
  const result: Record<string, Submission[]> = {};
  if (!subtaskIds.length) return result;

  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .in('subtask_id', subtaskIds)
    .order('submitted_at', { ascending: false });
  if (error) throw error;

  (data ?? []).forEach(row => {
    const sub = row as Submission;
    if (!result[sub.subtask_id]) result[sub.subtask_id] = [];
    result[sub.subtask_id].push(sub);
  });
  return result;
}

export async function uploadFileToStorage(
  file: File,
  folder: string,
): Promise<UploadedFile> {
  const safeName = file.name.replace(/[^\w.\-]/g, '_');
  const path = `${folder}/${Date.now()}_${safeName}`;
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, name: file.name, size: file.size };
}

export async function submitFilesToSubtask(params: {
  subtaskId: string;
  taskId: string;
  files: File[];
  note: string;
  memberId: string;
  isLate: boolean;
  lateDays: number;
}): Promise<void> {
  const now = new Date().toISOString();

  for (const file of params.files) {
    const uploaded = await uploadFileToStorage(file, `subtask_${params.subtaskId}`);
    const { error } = await supabase.from('submissions').insert({
      subtask_id: params.subtaskId,
      member_id: params.memberId,
      file_url: uploaded.url,
      file_name: uploaded.name,
      file_size: uploaded.size,
      note: params.note || null,
      is_rejected: false,
      is_late: params.isLate,
      late_days: params.lateDays,
      submitted_at: now,
    });
    if (error) throw error;
  }

  const { error: updErr } = await supabase
    .from('subtasks')
    .update({ status: 'submitted', submitted_at: now })
    .eq('id', params.subtaskId);
  if (updErr) throw updErr;
}

export async function scoreSubmission(params: {
  submissionId: string;
  subtaskId: string;
  score: number;
  contribution_pct: number;
  head_note: string;
  scored_by: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('submissions')
    .update({
      score: params.score,
      contribution_pct: params.contribution_pct,
      head_note: params.head_note,
      is_rejected: false,
      scored_by: params.scored_by,
      scored_at: now,
    })
    .eq('id', params.submissionId);
  if (error) throw error;

  const { error: sErr } = await supabase
    .from('subtasks')
    .update({ status: 'scored' })
    .eq('id', params.subtaskId);
  if (sErr) throw sErr;
}

export async function rejectSubmission(params: {
  submissionId: string;
  subtaskId: string;
  head_note: string;
  scored_by: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('submissions')
    .update({
      is_rejected: true,
      head_note: params.head_note,
      scored_by: params.scored_by,
      scored_at: now,
    })
    .eq('id', params.submissionId);
  if (error) throw error;

  const { error: sErr } = await supabase
    .from('subtasks')
    .update({ status: 'doing' })
    .eq('id', params.subtaskId);
  if (sErr) throw sErr;
}

/* ─────────────────────────────────────────────
   TASK SUBMISSIONS (Trưởng ban → Chủ nhiệm)
   ───────────────────────────────────────────── */
export async function fetchTaskSubmission(taskId: string): Promise<TaskSubmission | null> {
  const { data, error } = await supabase
    .from('task_submissions')
    .select('*')
    .eq('task_id', taskId)
    .order('submitted_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data && data[0]) ? (data[0] as TaskSubmission) : null;
}

export async function fetchTaskSubmissionById(
  id: string,
): Promise<TaskSubmission | null> {
  const { data, error } = await supabase
    .from('task_submissions')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !data) return null;
  return data as TaskSubmission;
}

export async function submitTaskToPresident(params: {
  taskId: string;
  headId: string;
  finalFiles: FinalFile[];
  summary: string;
  scoreboard: ScoreboardEntry[];
}): Promise<void> {
  const { error } = await supabase.from('task_submissions').insert({
    task_id: params.taskId,
    head_id: params.headId,
    final_files: params.finalFiles,
    summary: params.summary,
    scoreboard: params.scoreboard,
    status: 'pending',
    submitted_at: new Date().toISOString(),
  });
  if (error) throw error;

  const { error: tErr } = await supabase
    .from('tasks')
    .update({ status: 'pending_review' })
    .eq('id', params.taskId);
  if (tErr) throw tErr;
}

export async function approveTaskSubmission(params: {
  taskSubmissionId: string;
  taskId: string;
  reviewedBy: string;
  note: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('task_submissions')
    .update({
      status: 'approved',
      president_note: params.note || null,
      reviewed_by: params.reviewedBy,
      reviewed_at: now,
    })
    .eq('id', params.taskSubmissionId);
  if (error) throw error;

  const { error: tErr } = await supabase
    .from('tasks')
    .update({ status: 'approved' })
    .eq('id', params.taskId);
  if (tErr) throw tErr;
}

export async function rejectTaskSubmission(params: {
  taskSubmissionId: string;
  taskId: string;
  reviewedBy: string;
  reason: string;
  currentRejectCount: number;
}): Promise<number> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('task_submissions')
    .update({
      status: 'rejected',
      reject_reason: params.reason,
      reviewed_by: params.reviewedBy,
      reviewed_at: now,
    })
    .eq('id', params.taskSubmissionId);
  if (error) throw error;

  const newCount = params.currentRejectCount + 1;
  const { error: tErr } = await supabase
    .from('tasks')
    .update({ status: 'rejected', reject_count: newCount })
    .eq('id', params.taskId);
  if (tErr) throw tErr;

  return newCount;
}

/* ─────────────────────────────────────────────
   HISTORY
   ───────────────────────────────────────────── */
export async function logHistory(input: TaskHistoryInput): Promise<void> {
  try {
    const { data: authData } = await supabase.auth.getUser();
    await supabase.from('task_history').insert({
      task_id: input.task_id,
      action: input.action,
      actor_id: authData?.user?.id ?? null,
      old_status: input.old_status ?? null,
      new_status: input.new_status ?? null,
      note: input.note ?? '',
      metadata: input.metadata ?? {},
    });
  } catch (err) {
    console.warn('[logHistory] warning:', err);
  }
}

export async function fetchTaskHistory(taskId: string): Promise<TaskHistory[]> {
  const { data, error } = await supabase
    .from('task_history')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TaskHistory[];
}

/* ─────────────────────────────────────────────
   USER DEPARTMENTS (cho member filter)
   ───────────────────────────────────────────── */
/**
 * Lấy danh sách department_id mà user thuộc về.
 * Giả định bảng `department_members` có cột `user_id` và `department_id`.
 * Nếu schema khác → đổi tên cột ở 2 dòng `.eq/.select`.
 */
export async function fetchUserDepartments(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('department_members')
    .select('department_id')
    .eq('user_id', userId);
  if (error) {
    console.warn('[Tasks] fetchUserDepartments failed:', error.message);
    return [];
  }
  return (data ?? []).map((r: { department_id: string }) => r.department_id);
}
