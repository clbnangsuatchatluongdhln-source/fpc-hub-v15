export type ProjectAccent = 'pink' | 'cyan' | 'violet' | 'amber';
export type ProjectStatus = 'active' | 'paused' | 'completed';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  tag: string;
  accent: ProjectAccent;
  status: ProjectStatus;
  deadline: string | null;
  owner_id: string | null;
  department_id: string | null;
  head_id: string | null;
  members: string[];
  created_at?: string;
  updated_at?: string;
}

export type PhaseStatus = 'pending' | 'doing' | 'done';

export interface ProjectPhase {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  order_index: number;
  status: PhaseStatus;
  created_at?: string;
  updated_at?: string;
}

export type ReportType = 'phase' | 'weekly' | 'monthly';
export type ReportStatus = 'approved' | 'pending' | 'rejected';

export interface ProjectReport {
  id: string;
  project_id: string;
  phase_id: string | null;
  reported_by: string | null;
  report_type: ReportType;
  progress_pct: number | null;
  note: string | null;
  status: ReportStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export type TaskStatus =
  | 'assigned' | 'working' | 'pending_review' | 'approved' | 'rejected';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface ProjectTask {
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
  created_at: string;
}

export interface ProjectFile {
  id: string;
  name: string;
  size: number;
  original_size: number | null;
  kind: string;
  mime_type: string;
  storage_path: string | null;
  public_url: string | null;
  project_id: string;
  uploaded_by: string | null;
  saved_pct: number;
  created_at: string;
}

export interface CreatePhaseInput {
  name: string;
  start_date: string | null;
  end_date: string | null;
  order_index: number;
  status: PhaseStatus;
}

export interface CreateProjectInput {
  name: string;
  description: string;
  departmentId: string | null;
  startDate: string;
  endDate: string;
  phases: CreatePhaseInput[];
}

export interface CreateReportInput {
  projectId: string;
  phaseId: string | null;
  progressPct: number;
  note: string;
  reportType?: ReportType;
}

export interface ProjectDetailData {
  phases: ProjectPhase[];
  tasks: ProjectTask[];
  reports: ProjectReport[];
  files: ProjectFile[];
}
