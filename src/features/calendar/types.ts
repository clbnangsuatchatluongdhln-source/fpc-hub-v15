// ============================================================
// FPC HUB v15 · Calendar Module — Types
// ============================================================

export type CalendarView = 'month' | 'week' | 'day';
export type EventVisibility = 'public' | 'department' | 'private';
export type EventTone = 'pink' | 'cyan' | 'violet' | 'amber' | 'emerald';

/** Sự kiện lịch. `label` là alias lịch sử của `title`. */
export interface CalendarEvent {
  id: string;
  title: string;
  label?: string | null;
  description?: string | null;
  start_time: string; // ISO
  end_time: string;   // ISO
  tone: EventTone;
  icon: string;
  visibility: EventVisibility;
  department_id?: string | null;
  project_id?: string | null;
  created_by?: string | null;
  /** Legacy fields (v10). */
  day?: number;
  time?: string;
}

/** Task rút gọn dùng để hiển thị deadline trên lịch. */
export interface CalendarTask {
  id: string;
  title: string;
  deadline_current?: string | null;
  deadline_original?: string | null;
  status?: string | null;
  department_id?: string | null;
  project_id?: string | null;
}

export interface Department {
  id: string;
  name: string;
  color: EventTone;
  icon?: string;
  head_id?: string | null;
}

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  tag?: string;
  accent?: EventTone;
  status?: string;
  department_id?: string | null;
  head_id?: string | null;
  members?: string[];
  deadline?: string | null;
  owner_id?: string | null;
}

/** 5 filter chính (đã gộp showPrivate/showDepartment từ v11). */
export interface CalendarFilters {
  myEvents: boolean;
  deptEvents: boolean;
  clubEvents: boolean;
  tasks: boolean;
  showDone: boolean;
}

export interface CalendarState {
  view: CalendarView;
  cursor: Date;
  today: Date;
  miniMonth: Date;
  extendedHours: boolean;
  filters: CalendarFilters;
  rendering: boolean;
  dataVersion: number;
  indexedVersion: number;
  monthIndex: Map<string, CalendarItem[]>;
}

export interface CalendarColor {
  bg: string;
  border: string;
  text: string;
  solid: string;
  opacity?: string;
}

/** Item đã chuẩn hoá dùng trong render (event hoặc task). */
export interface CalendarItem {
  type: 'event' | 'task';
  id: string;
  title: string;
  date: Date;
  start: Date;
  end: Date;
  tone: EventTone;
  colorCls: CalendarColor;
  icon: string;
  fileCount?: number;
  isMultiDay?: boolean;
  isDone?: boolean;
  raw?: CalendarEvent;
  taskRaw?: CalendarTask;
  dept?: Department;
  count?: number;
  ids?: string[];
}

export interface CalendarLayout {
  event: CalendarItem;
  left: number;
  width: number;
  z: number;
  hasMore?: boolean;
  moreCount?: number;
}

export interface TimeRange {
  start: number;
  end: number;
  total: number;
}

/** Context đầy đủ để render — tránh phụ thuộc global. */
export interface RenderContext {
  state: CalendarState;
  events: CalendarEvent[];
  tasks: CalendarTask[];
  projects: Project[];
  departments: Department[];
  /** Map event_id → danh sách file đính kèm (để hiện 📎N). */
  filesByEventId?: Record<string, unknown[]>;
  currentUserId: string | null;
}
