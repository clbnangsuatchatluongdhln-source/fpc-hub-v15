// ============================================================
// FPC HUB v15 · Calendar Module — Service layer
// Giao tiếp Supabase cho sự kiện / task deadline / dự án.
// ============================================================

import { supabase } from '../../core/supabase';
import type {
  CalendarEvent,
  CalendarTask,
  Department,
  EventTone,
  EventVisibility,
  Project,
} from './types';

/** Row thô từ bảng events (assumed shape giống v14). */
interface EventRow {
  id: string;
  title?: string | null;
  label?: string | null;
  description?: string | null;
  start_time: string;
  end_time: string;
  tone?: string | null;
  icon?: string | null;
  visibility?: string | null;
  department_id?: string | null;
  project_id?: string | null;
  created_by?: string | null;
  day?: number | null;
  time?: string | null;
}

const TONES: readonly EventTone[] = ['pink', 'cyan', 'violet', 'amber', 'emerald'];
const VISIBILITIES: readonly EventVisibility[] = ['public', 'department', 'private'];

function toTone(v: string | null | undefined): EventTone {
  return (v && (TONES as readonly string[]).includes(v) ? v : 'violet') as EventTone;
}
function toVisibility(v: string | null | undefined): EventVisibility {
  return (v && (VISIBILITIES as readonly string[]).includes(v) ? v : 'public') as EventVisibility;
}

function mapEventRow(row: EventRow): CalendarEvent {
  return {
    id: row.id,
    title: row.title ?? row.label ?? 'Sự kiện',
    label: row.label ?? null,
    description: row.description ?? null,
    start_time: row.start_time,
    end_time: row.end_time,
    tone: toTone(row.tone),
    icon: row.icon ?? 'fa-calendar',
    visibility: toVisibility(row.visibility),
    department_id: row.department_id ?? null,
    project_id: row.project_id ?? null,
    created_by: row.created_by ?? null,
    day: row.day ?? undefined,
    time: row.time ?? undefined,
  };
}

/** Lấy toàn bộ sự kiện, sort tăng dần theo start_time. */
export async function fetchEvents(): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('start_time', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as EventRow[]).map(mapEventRow);
}

export interface SaveEventInput {
  id?: string;
  title: string;
  description?: string | null;
  start_time: string;
  end_time: string;
  tone?: EventTone;
  icon?: string;
  visibility?: EventVisibility;
  department_id?: string | null;
  project_id?: string | null;
  created_by?: string | null;
}

/** Insert/update — trả về row đã lưu. */
export async function saveEvent(input: SaveEventInput): Promise<CalendarEvent> {
  const payload = {
    title: input.title,
    label: input.title,
    description: input.description ?? null,
    start_time: input.start_time,
    end_time: input.end_time,
    tone: input.tone ?? 'violet',
    icon: input.icon ?? 'fa-calendar',
    visibility: input.visibility ?? 'public',
    department_id: input.department_id ?? null,
    project_id: input.project_id ?? null,
    created_by: input.created_by ?? null,
  };

  if (input.id) {
    const { data, error } = await supabase
      .from('events')
      .update(payload)
      .eq('id', input.id)
      .select()
      .single();
    if (error) throw error;
    return mapEventRow(data as EventRow);
  }

  const { data, error } = await supabase
    .from('events')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return mapEventRow(data as EventRow);
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw error;
}

/** Task có deadline (để hiển thị trên lịch). */
export async function fetchTasksWithDeadlines(): Promise<CalendarTask[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id,title,deadline_current,deadline_original,status,department_id,project_id')
    .not('deadline_current', 'is', null)
    .order('deadline_current', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CalendarTask[];
}

export async function fetchDepartments(): Promise<Department[]> {
  const { data, error } = await supabase
    .from('departments')
    .select('id,name,color,icon,head_id')
    .is('deleted_at', null);
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string; name: string; color?: string | null; icon?: string | null; head_id?: string | null }>).map((d) => ({
    id: d.id,
    name: d.name,
    color: toTone(d.color),
    icon: d.icon ?? 'fa-users',
    head_id: d.head_id ?? null,
  }));
}

export async function fetchProjects(): Promise<Project[]> {
  const { data, error } = await supabase.from('projects').select('*');
  if (error) throw error;
  return (data ?? []) as Project[];
}

/** Tạo task tự động khi giao sự kiện cho ban (visibility = department). */
export interface CreateTaskFromEventInput {
  title: string;
  description: string | null;
  department_id: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  start_date: string;
  deadline: string;
  created_by: string | null;
  project_id?: string | null;
}

export async function createTaskFromEvent(input: CreateTaskFromEventInput): Promise<void> {
  const { error } = await supabase.from('tasks').insert({
    title: input.title,
    description: input.description,
    requirement: null,
    department_id: input.department_id,
    project_id: input.project_id ?? null,
    priority: input.priority,
    start_date: input.start_date,
    deadline_original: input.deadline,
    deadline_current: input.deadline,
    status: 'assigned',
    created_by: input.created_by,
  });
  if (error) throw error;
}

/** Tạo dự án + phases, rollback project nếu phases fail. */
export interface CreateProjectInput {
  name: string;
  description: string | null;
  department_id: string | null;
  start_date: string;
  end_date: string;
  owner_id: string | null;
  phases: Array<{ name: string; start_date: string | null; end_date: string | null }>;
}

export async function createProjectWithPhases(input: CreateProjectInput): Promise<Project> {
  const { data: project, error: prErr } = await supabase
    .from('projects')
    .insert({
      name: input.name,
      description: input.description,
      tag: 'Project',
      accent: 'violet',
      status: 'active',
      deadline: input.end_date,
      owner_id: input.owner_id,
      department_id: input.department_id,
      members: input.owner_id ? [input.owner_id] : [],
    })
    .select()
    .single();
  if (prErr) throw prErr;

  const phaseRows = input.phases.map((p, idx) => ({
    project_id: (project as Project).id,
    name: p.name,
    start_date: p.start_date,
    end_date: p.end_date,
    order_index: idx,
    status: 'pending',
  }));

  const { error: phErr } = await supabase.from('project_phases').insert(phaseRows);
  if (phErr) {
    await supabase.from('projects').delete().eq('id', (project as Project).id);
    throw phErr;
  }

  return project as Project;
}
