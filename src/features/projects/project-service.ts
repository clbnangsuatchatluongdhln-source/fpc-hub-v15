const { supabase } = await import('@/core/supabase');
import type {
  Project,
  ProjectPhase,
  ProjectReport,
  ProjectTask,
  ProjectFile,
  ProjectDetailData,
  CreateProjectInput,
  CreateReportInput,
  PhaseStatus,
} from './types';

/* ─────────────────────────────────────────────
   READ
   ───────────────────────────────────────────── */
export async function fetchProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Project[];
}

export async function fetchProjectDetails(projectId: string): Promise<ProjectDetailData> {
  const [phasesRes, tasksRes, reportsRes, filesRes] = await Promise.all([
    supabase
      .from('project_phases')
      .select('*')
      .eq('project_id', projectId)
      .order('order_index', { ascending: true }),
    supabase
      .from('tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    supabase
      .from('project_reports')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    supabase
      .from('files')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
  ]);

  if (phasesRes.error)  throw phasesRes.error;
  if (tasksRes.error)   throw tasksRes.error;
  if (reportsRes.error) throw reportsRes.error;
  if (filesRes.error)   throw filesRes.error;

  return {
    phases:  (phasesRes.data  ?? []) as ProjectPhase[],
    tasks:   (tasksRes.data   ?? []) as ProjectTask[],
    reports: (reportsRes.data ?? []) as ProjectReport[],
    files:   (filesRes.data   ?? []) as ProjectFile[],
  };
}

/* ─────────────────────────────────────────────
   WRITE
   ───────────────────────────────────────────── */
export async function createProjectWithPhases(input: CreateProjectInput): Promise<Project> {
  const { data: userData } = await supabase.auth.getUser();
  const currentUserId = userData?.user?.id ?? null;

  if (!currentUserId) throw new Error('Chưa đăng nhập');

  if (!input.name || input.name.length < 3) {
    throw new Error('Tên dự án phải có ít nhất 3 ký tự');
  }
  if (!input.startDate || !input.endDate) {
    throw new Error('Chọn thời gian dự án');
  }
  if (input.phases.length === 0) {
    throw new Error('Cần ít nhất 1 giai đoạn');
  }

  const { data: projectRow, error: prErr } = await supabase
    .from('projects')
    .insert({
      name: input.name,
      description: input.description,
      tag: 'Project',
      accent: 'violet',
      status: 'active',
      deadline: input.endDate,
      owner_id: currentUserId,
      department_id: input.departmentId,
      head_id: null,
      members: [currentUserId],
    })
    .select()
    .single();

  if (prErr) throw prErr;
  const project = projectRow as Project;

  const phaseRows = input.phases.map((p, idx) => ({
    project_id: project.id,
    name: p.name,
    start_date: p.start_date,
    end_date: p.end_date,
    order_index: idx,
    status: p.status,
  }));

  const { error: phErr } = await supabase.from('project_phases').insert(phaseRows);
  if (phErr) {
    await supabase.from('projects').delete().eq('id', project.id);
    throw phErr;
  }

  return project;
}

export async function createReport(input: CreateReportInput): Promise<ProjectReport> {
  const { data: userData } = await supabase.auth.getUser();
  const currentUserId = userData?.user?.id;
  if (!currentUserId) throw new Error('Chưa đăng nhập');

  if (input.progressPct < 0 || input.progressPct > 100) {
    throw new Error('Tiến độ phải từ 0-100%');
  }
  if (!input.note || input.note.length < 5) {
    throw new Error('Vui lòng nhập ghi chú ít nhất 5 ký tự');
  }

  const { data, error } = await supabase
    .from('project_reports')
    .insert({
      project_id: input.projectId,
      phase_id: input.phaseId,
      reported_by: currentUserId,
      report_type: input.reportType ?? 'phase',
      progress_pct: input.progressPct,
      note: input.note,
      status: 'approved',
    })
    .select()
    .single();

  if (error) throw error;
  return data as ProjectReport;
}

export async function updatePhaseStatus(phaseId: string, status: PhaseStatus): Promise<void> {
  const { error } = await supabase
    .from('project_phases')
    .update({ status })
    .eq('id', phaseId);
  if (error) throw error;
}

export async function deleteProjectFileMeta(fileId: string): Promise<void> {
  const { error } = await supabase.from('files').delete().eq('id', fileId);
  if (error) throw error;
}

export async function reloadProjectFiles(projectId: string): Promise<ProjectFile[]> {
  const { data, error } = await supabase
    .from('files')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProjectFile[];
}
