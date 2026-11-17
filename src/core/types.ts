export type Role = 'super_admin' | 'admin' | 'member' | 'viewer';
export type ApprovalStatus = 'pending' | 'active' | 'rejected';
export type DeptRole = 'head' | 'deputy' | 'member';

export interface Profile {
  club_position?: import('./access').ClubPosition;
  id: string;
  email: string;
  display_name: string;
  nickname: string | null;
  bio: string | null;
  avatar_url: string | null;
  avatar_color: string;
  role: Role;
  approval_status: ApprovalStatus;
  status: string;
  timezone: string;
  version: number;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Department {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  head_id: string | null;
  version: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DepartmentMember {
  department_id: string;
  user_id: string;
  role: DeptRole;
  joined_at: string;
}

export interface Conversation {
  id: string;
  type: 'dm' | 'group' | 'channel';
  name: string | null;
  avatar_color: string;
  members: string[];
  peer_id: string | null;
  created_by: string | null;
  pinned: boolean;
  muted: boolean;
  created_at: string;
  last_message_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string | null;
  text: string;
  status: 'sent' | 'delivered' | 'seen';
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  tag: string;
  accent: string;
  status: string;
  deadline: string | null;
  owner_id: string | null;
  department_id: string | null;
  head_id: string | null;
  members: string[];
  progress: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectPhase {
  id: string;
  project_id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  order_index: number;
  status: string;
  created_at: string;
}

export type TaskStatus = 'assigned' | 'working' | 'pending_review' | 'approved' | 'rejected';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  requirement: string | null;
  department_id: string | null;
  project_id: string | null;
  priority: TaskPriority;
  start_date: string | null;
  deadline_original: string | null;
  deadline_current: string | null;
  status: TaskStatus;
  created_by: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

export type EventVisibility = 'public' | 'department' | 'private';

export interface CalendarEvent {
  id: string;
  title: string;
  label: string | null;
  description: string | null;
  start_time: string;
  end_time: string;
  tone: string;
  icon: string;
  visibility: EventVisibility;
  department_id: string | null;
  project_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FileRecord {
  storage_bucket?: string | null;
  storage_version?: string | null;
  id: string;
  name: string;
  size: number | null;
  original_size: number | null;
  mime_type: string | null;
  kind: string | null;
  storage_provider: string;
  file_type: string;
  storage_path: string | null;
  public_url: string | null;
  uploaded_by: string | null;
  project_id: string | null;
  event_id: string | null;
  saved_pct: number;
  created_at: string;
}

export type SubtaskStatus = 'todo' | 'doing' | 'submitted' | 'scored';

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  deadline: string | null;
  order_index: number;
  status: SubtaskStatus;
  created_by: string | null;
  created_at: string;
}

export interface Submission {
  id: string;
  subtask_id: string;
  member_id: string;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  note: string | null;
  score: number | null;
  contribution_pct: number | null;
  head_note: string | null;
  is_rejected: boolean;
  is_late: boolean;
  late_days: number;
  scored_by: string | null;
  scored_at: string | null;
  submitted_at: string;
}

export interface TaskSubmission {
  id: string;
  task_id: string;
  head_id: string;
  final_files: { url: string; name: string; size: number }[] | null;
  summary: string | null;
  scoreboard: { member_id: string; member_name: string; score: number }[] | null;
  status: 'pending' | 'approved' | 'rejected';
  reject_reason: string | null;
  president_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  submitted_at: string;
}

export interface TaskHistoryEntry {
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

export interface ProjectReport {
  id: string;
  project_id: string;
  phase_id: string | null;
  reported_by: string | null;
  report_type: 'phase' | 'weekly' | 'monthly';
  progress_pct: number | null;
  note: string | null;
  status: 'approved' | 'pending' | 'rejected';
  created_at: string;
}

export interface UserScore {
  id: string;
  user_id: string;
  task_id: string;
  role: string | null;
  score: number | null;
  contribution_pct: number | null;
  recorded_at: string;
}

export interface ClubSettings {
  id: number;
  club_name: string;
  logo_url: string | null;
  description: string | null;
  updated_at: string;
}
