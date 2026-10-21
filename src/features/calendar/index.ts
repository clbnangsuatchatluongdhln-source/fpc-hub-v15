// ============================================================
// FPC HUB v15 · Calendar Module — Public API
// ============================================================

import { supabase } from '../../core/supabase';
import { Toast } from '../../ui/toast';
import {
  fetchDepartments,
  fetchEvents,
  fetchProjects,
  fetchTasksWithDeadlines,
} from './calendar-service';
import {
  initCalendarDOM,
  renderCalendar,
  type CalendarController,
} from './calendar-ui';
import { addDays, addMonths } from './calendar-utils';
import { openCreateEventQuick, openCreateModal, type OpenCreateModalOptions } from './event-modal';
import type {
  CalendarEvent,
  CalendarFilters,
  CalendarItem,
  CalendarState,
  CalendarTask,
  CalendarView,
  Department,
  Project,
  RenderContext,
} from './types';

export interface InitCalendarFeatureOptions {
  onQuickUpload?: (eventId: string) => void | Promise<void>;
  onItemClick?: (item: CalendarItem) => void;
}

/* ─── Module state ──────────────────────────────────────── */

let calState: CalendarState = createDefaultState();
let calEvents: CalendarEvent[] = [];
let calTasks: CalendarTask[] = [];
let calProjects: Project[] = [];
let calDepartments: Department[] = [];
let currentUserId: string | null = null;
let initialized = false;
let featureOptions: InitCalendarFeatureOptions = {};
let abortController: AbortController | null = null;

function createDefaultState(): CalendarState {
  return {
    view: 'month',
    cursor: new Date(),
    today: new Date(),
    miniMonth: new Date(),
    extendedHours: false,
    filters: {
      myEvents: true,
      deptEvents: true,
      clubEvents: true,
      tasks: true,
      showDone: false,
    },
    rendering: false,
    dataVersion: 0,
    indexedVersion: -1,
    monthIndex: new Map(),
  };
}

function invalidateCache(): void {
  calState.dataVersion++;
  calState.monthIndex.clear();
  calState.indexedVersion = -1;
}

function getContext(): RenderContext {
  return {
    state: calState,
    events: calEvents,
    tasks: calTasks,
    projects: calProjects,
    departments: calDepartments,
    currentUserId,
  };
}

function rerender(): void {
  renderCalendar(getContext());
}

async function loadAuthUser(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  currentUserId = data.session?.user?.id ?? null;
}

async function loadAllData(): Promise<void> {
  const [events, tasks, projects, departments] = await Promise.all([
    fetchEvents(),
    fetchTasksWithDeadlines(),
    fetchProjects(),
    fetchDepartments(),
  ]);
  calEvents = events;
  calTasks = tasks;
  calProjects = projects;
  calDepartments = departments;
  invalidateCache();
}

/* ─── Controller ────────────────────────────────────────── */

function shiftCursor(dir: number): void {
  const d = calState.cursor;
  if (calState.view === 'month') calState.cursor = addMonths(d, dir);
  else if (calState.view === 'week') calState.cursor = addDays(d, 7 * dir);
  else calState.cursor = addDays(d, dir);
}

const controller: CalendarController = {
  onToday: () => {
    calState.cursor = new Date();
    rerender();
  },
  onPrev: () => {
    shiftCursor(-1);
    rerender();
  },
  onNext: () => {
    shiftCursor(1);
    rerender();
  },
  onYearChange: (year) => {
    calState.cursor = new Date(year, calState.cursor.getMonth(), 1);
    rerender();
  },
  onViewChange: (view: CalendarView) => {
    calState.view = view;
    rerender();
  },
  onFilterChange: (key: keyof CalendarFilters) => {
    calState.filters[key] = !calState.filters[key];
    invalidateCache();
    rerender();
  },
  onHoursToggle: () => {
    calState.extendedHours = !calState.extendedHours;
    rerender();
  },
  onMiniPrev: () => {
    calState.miniMonth = addMonths(calState.miniMonth, -1);
    rerender();
  },
  onMiniNext: () => {
    calState.miniMonth = addMonths(calState.miniMonth, 1);
    rerender();
  },
  onMiniSelect: (date) => {
    calState.cursor = date;
    calState.miniMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    rerender();
  },
  onQuickUpload: (eventId) => {
    if (featureOptions.onQuickUpload) {
      void featureOptions.onQuickUpload(eventId);
    } else {
      Toast.show('Upload pipeline chưa sẵn sàng', { type: 'error' });
    }
  },
  onItemClick: (item) => {
    if (featureOptions.onItemClick) {
      featureOptions.onItemClick(item);
      return;
    }
    if (item.type === 'event') {
      openCreateEventQuick(item.date, getModalOpts());
    }
  },
  onCreateAt: (date) => {
    openCreateEventQuick(date, getModalOpts());
  },
};

function getModalOpts(): OpenCreateModalOptions {
  return {
    projects: calProjects,
    departments: calDepartments,
    currentUserId,
    onCreated: async () => {
      try {
        await loadAllData();
        rerender();
      } catch (err) {
        console.error('[calendar] refresh after create failed:', err);
      }
    },
  };
}

/* ─── Navigation ────────────────────────────────────────── */

const VIEW_TITLES: Record<string, string> = {
  timeline: 'Lịch',
  projects: 'Dự án',
  admin: 'Quản trị',
  departments: 'Tổ chức',
};

export function navigate(view: string): void {
  if (!(view in VIEW_TITLES)) view = 'timeline';

  document.querySelectorAll<HTMLElement>('.nav-item').forEach((b) => {
    b.classList.toggle('nav-active', b.dataset.nav === view);
  });

  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = VIEW_TITLES[view] ?? 'Lịch';

  const sections = ['timeline', 'projects', 'admin', 'departments', 'tasks'];
  for (const s of sections) {
    document.getElementById(`${s}Section`)?.classList.add('hidden');
  }

  const section = document.getElementById(`${view}Section`);
  if (section) {
    section.classList.remove('hidden');
    section.style.display = '';

    /* FIX: force #calWrapper visible — chống Avatar reset section về hidden */
    if (view === 'timeline') {
      const wrapper = document.getElementById('calWrapper');
      if (wrapper) {
        wrapper.classList.remove('hidden');
        wrapper.style.display = '';
        wrapper.style.visibility = '';
      }
    }
  }

  if (view === 'timeline') {
    rerender();
  }
}

/* ─── Listeners (AbortController để cleanup) ────────────── */

function bindKeyboardShortcuts(signal: AbortSignal): void {
  document.addEventListener(
    'keydown',
    (e) => {
      if (!isTimelineVisible()) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const modalRoot = document.getElementById('modalRoot');
      if (modalRoot && modalRoot.children.length > 0) return;

      switch (e.key) {
        case 't':
        case 'T':
          calState.cursor = new Date();
          rerender();
          break;
        case 'm':
        case 'M':
          calState.view = 'month';
          rerender();
          break;
        case 'w':
        case 'W':
          calState.view = 'week';
          rerender();
          break;
        case 'd':
        case 'D':
          calState.view = 'day';
          rerender();
          break;
        case 'h':
        case 'H':
          calState.extendedHours = !calState.extendedHours;
          rerender();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          shiftCursor(-1);
          rerender();
          break;
        case 'ArrowRight':
          e.preventDefault();
          shiftCursor(1);
          rerender();
          break;
        case 'n':
        case 'N':
          e.preventDefault();
          openCreateEventQuick(calState.cursor, getModalOpts());
          break;
        default:
          break;
      }
    },
    { capture: true, signal },
  );
}

function isTimelineVisible(): boolean {
  const section = document.getElementById('timelineSection');
  return Boolean(section && !section.classList.contains('hidden'));
}

function bindCreateButton(signal: AbortSignal): void {
  document.addEventListener(
    'click',
    (e) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const trigger = t.closest<HTMLElement>('[data-action="open-create"]');
      if (!trigger) return;
      e.preventDefault();
      openCreateModal(getModalOpts());
    },
    { signal },
  );
}

/* ─── Init / destroy ────────────────────────────────────── */

export async function initCalendarFeature(
  options: InitCalendarFeatureOptions = {},
): Promise<void> {
  console.log('[calendar] initCalendarFeature called, initialized =', initialized);
  featureOptions = options;

  /* FIX: nếu đã init rồi → KHÔNG silent-return, mà re-render để refresh DOM */
  if (initialized) {
    console.log('[calendar] already initialized → re-render only');
    try {
      await loadAllData();
      rerender();
      navigate('timeline');
    } catch (err) {
      console.warn('[calendar] re-render failed:', err);
    }
    return;
  }

  abortController = new AbortController();
  const { signal } = abortController;

  try {
    await loadAuthUser();
    console.log('[calendar] auth user:', currentUserId);
  } catch (err) {
    console.warn('[calendar] load auth user failed:', err);
  }

  /* Tạo DOM wrapper trước — nếu fail thì throw để biết */
  try {
    initCalendarDOM(controller);
    console.log('[calendar] initCalendarDOM OK, calWrapper =', !!document.getElementById('calWrapper'));
  } catch (err) {
    console.error('[calendar] initCalendarDOM FAILED:', err);
    abortController.abort();
    abortController = null;
    return; /* KHÔNG set initialized = true → lần sau retry được */
  }

  bindKeyboardShortcuts(signal);
  bindCreateButton(signal);

  try {
    await loadAllData();
    console.log('[calendar] loadAllData OK');
  } catch (err) {
    console.error('[calendar] load data failed:', err);
    Toast.show('Không tải được dữ liệu lịch', { type: 'error' });
  }

  navigate('timeline');

  /* FIX: chỉ set initialized = true SAU KHI mọi thứ thành công */
  initialized = true;
  console.log('[calendar] initCalendarFeature DONE');
}

export function destroyCalendarFeature(): void {
  if (!initialized) return;
  initialized = false;

  if (abortController) {
    abortController.abort();
    abortController = null;
  }

  featureOptions = {};
  calEvents = [];
  calTasks = [];
  calProjects = [];
  calDepartments = [];
  currentUserId = null;
  calState = createDefaultState();
}

/* ─── Re-exports ────────────────────────────────────────── */

export { openCreateEventQuick, openCreateModal } from './event-modal';
export type {
  CalendarEvent,
  CalendarFilters,
  CalendarItem,
  CalendarState,
  CalendarTask,
  CalendarView,
  Department,
  Project,
} from './types';
