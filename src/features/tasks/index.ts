/* ============================================================
   FPC HUB v15 · Module 5 · Public API
   ============================================================ */
import { Toast } from '../../ui/toast';
import { Modal } from '../../ui/modal';
import { escHtml } from '../../utils';
import {
  ensureProfileLoaded, fetchTasks, fetchDepartments, fetchUsers,
  fetchProjectOptions, fetchSubtasks, fetchSubmissionsBySubtasks,
  fetchTaskSubmission, deleteTask, deleteSubtask, isSuperAdmin,
  isPresident, isDeptHead, clearProfileCache,
  fetchUserDepartments,
} from './task-service';
import { renderTaskList, renderTaskDetail, TASK_STATUS_MAP } from './task-ui';
import type { TaskCardContext, TaskDetailHandlers } from './task-ui';
import {
  openCreateTaskModal, openCreateSubtaskModal, openSubmitFileModal,
  openScoreModal, openSubmitToPresidentModal, openPresidentReviewModal,
  MODAL_IDS,
} from './task-workflow';
import type { WorkflowContext } from './task-workflow';
import { openTaskHistoryModal } from './task-history-modal';
import type {
  Task, Subtask, Submission, TaskSubmission, Profile, Department,
  ProjectOption, TaskFilter,
} from './types';

/* ─────────────────────────────────────────────
   STATE
   ───────────────────────────────────────────── */
interface State {
  initialized: boolean;
  loading: boolean;
  filter: TaskFilter;
  tasks: Task[];
  subtasks: Subtask[];
  submissions: Record<string, Submission[]>;
  taskSubmission: TaskSubmission | null;
  selectedTaskId: string | null;
  currentProfile: Profile | null;
  departments: Department[];
  users: Profile[];
  projects: ProjectOption[];
  userDepartments: string[];
}

const state: State = {
  initialized: false,
  loading: false,
  filter: 'all',
  tasks: [],
  subtasks: [],
  submissions: {},
  taskSubmission: null,
  selectedTaskId: null,
  currentProfile: null,
  departments: [],
  users: [],
  projects: [],
  userDepartments: [],
};

/* ─────────────────────────────────────────────
   INIT
   ───────────────────────────────────────────── */
export async function initTasksFeature(): Promise<void> {
  if (state.initialized) return;

  const profile = await ensureProfileLoaded();
  if (!profile) {
    console.warn('[Tasks] No profile yet — sẽ thử lại sau khi auth sẵn sàng');
    return;
  }

  state.initialized = true;
  state.currentProfile = profile;

  try {
    const [departments, users, projects, userDepts] = await Promise.all([
      fetchDepartments(),
      fetchUsers(),
      fetchProjectOptions(),
      fetchUserDepartments(profile.id),
    ]);
    state.departments = departments;
    state.users = users;
    state.projects = projects;
    state.userDepartments = userDepts;
  } catch (err) {
    console.warn('[Tasks] Failed to load lookup data:', err);
  }

  injectTasksSection();
  injectNavButton();
  attachCreateButton();
  /* Nav routing do main.ts đảm nhận qua global dispatcher */

  await refreshTasks();
  console.log('[Tasks] Module initialized');
}

/* ─────────────────────────────────────────────
   DOM INJECTION
   ───────────────────────────────────────────── */
function injectTasksSection(): void {
  if (document.getElementById('tasksSection')) return;

  const mainScrollInner = document.querySelector('#mainScroll > div');
  if (!mainScrollInner) return;

  const section = document.createElement('section');
  section.id = 'tasksSection';
  section.className = 'hidden';
  section.innerHTML = `
    <div class="glass rounded-2xl overflow-hidden">
      <div class="p-5 border-b border-white/[.06] flex justify-between items-center gap-3 flex-wrap">
        <div>
          <h2 class="text-lg font-black text-white flex items-center gap-2">
            <i class="fa-solid fa-list-check text-violet-400"></i>
            Công việc
          </h2>
          <p class="text-xs text-slate-500 mt-0.5" id="tasksSubtitle">Danh sách task đã giao cho các ban</p>
        </div>
        <button id="btnCreateTask" class="hidden px-4 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-violet-600 text-white text-xs font-black shadow-neon-pink hover:opacity-95 active:scale-[0.98] transition flex items-center gap-2">
          <i class="fa-solid fa-plus text-[11px]"></i>
          <span>Tạo task mới</span>
        </button>
      </div>
      <div id="taskFilterBar" class="px-5 py-3 border-b border-white/[.06] flex gap-2 flex-wrap"></div>
      <div id="taskList" class="p-5 space-y-3"></div>
      <div id="taskEmpty" class="hidden text-center py-16 px-6">
        <div class="w-16 h-16 rounded-2xl bg-white/[.03] mx-auto mb-4 flex items-center justify-center">
          <i class="fa-solid fa-clipboard-list text-2xl text-slate-700"></i>
        </div>
        <p class="text-slate-400 font-bold text-sm">Chưa có task nào</p>
        <p class="text-xs text-slate-500 mt-1 max-w-xs mx-auto">Chủ nhiệm tạo task mới để giao việc cho các ban</p>
      </div>
    </div>`;
  mainScrollInner.appendChild(section);
}

function injectNavButton(): void {
  if (document.querySelector('[data-nav="tasks"]')) return;
  const anchor = document.querySelector('[data-nav="projects"]');
  if (!anchor || !anchor.parentElement) return;

  const btn = document.createElement('button');
  btn.dataset.nav = 'tasks';
  btn.className =
    'nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-transparent text-sm font-semibold text-left text-slate-400 hover:text-white hover:bg-white/5';
  btn.innerHTML =
    '<i class="fa-solid fa-list-check w-5 text-center text-amber-400"></i><span>Công việc</span>';
  anchor.parentElement.appendChild(btn);
}

/* Public — main.ts gọi khi user bấm nav "Công việc" */
export function showTasksView(): void {
  document
    .querySelectorAll('[data-nav]')
    .forEach((b) => b.classList.remove('nav-active'));
  document.querySelector('[data-nav="tasks"]')?.classList.add('nav-active');

  const title = document.getElementById('pageTitle');
  if (title) title.textContent = 'Công việc';

  [
    'timelineSection',
    'projectsSection',
    'departmentsSection',
    'adminSection',
    'tasksSection',
  ].forEach((id) => document.getElementById(id)?.classList.add('hidden'));
  document.getElementById('tasksSection')?.classList.remove('hidden');
  renderTasksSection();
}

function attachCreateButton(): void {
  const btn = document.getElementById('btnCreateTask');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const ctx = buildWorkflowContext();
    if (ctx) openCreateTaskModal(ctx);
  });
}

/* ─────────────────────────────────────────────
   REFRESH / RENDER
   ───────────────────────────────────────────── */
export async function refreshTasks(): Promise<void> {
  state.loading = true;
  renderTasksSection();
  try {
    state.tasks = await fetchTasks();
  } catch (err) {
    Toast.show('Không tải được công việc: ' + errorMessage(err), {
      type: 'error',
    });
  } finally {
    state.loading = false;
    renderTasksSection();
  }
}

function renderTasksSection(): void {
  const listEl = document.getElementById('taskList');
  const emptyEl = document.getElementById('taskEmpty');
  const btnCreate = document.getElementById('btnCreateTask');
  const subtitle = document.getElementById('tasksSubtitle');
  if (!listEl || !state.currentProfile) return;

  if (btnCreate) {
    btnCreate.classList.toggle('hidden', !isSuperAdmin(state.currentProfile));
  }

  if (subtitle) {
    if (isSuperAdmin(state.currentProfile)) {
      subtitle.textContent = 'Toàn bộ task giao cho các ban';
    } else if (state.currentProfile.role === 'admin') {
      subtitle.textContent = 'Task của các ban';
    } else {
      subtitle.textContent = 'Task của ban bạn';
    }
  }

  renderFilterBar();

  let visible = state.tasks;
  /* Member filter theo ban: chỉ áp dụng khi user không phải admin/super admin
     và đã có department_members. Rỗng → fallback hiển thị tất cả để tránh trang trống. */
  if (
    state.currentProfile &&
    !isSuperAdmin(state.currentProfile) &&
    state.currentProfile.role !== 'admin' &&
    state.userDepartments.length > 0
  ) {
    visible = visible.filter((t) => state.userDepartments.includes(t.department_id));
  }
  if (state.filter !== 'all') {
    visible = visible.filter((t) => t.status === state.filter);
  }

  listEl.replaceChildren();

  if (state.loading) {
    for (let i = 0; i < 3; i++) {
      const skel = document.createElement('div');
      skel.className = 'h-32 rounded-2xl skel';
      listEl.appendChild(skel);
    }
    emptyEl?.classList.add('hidden');
    return;
  }

  if (!visible.length) {
    emptyEl?.classList.remove('hidden');
    listEl.classList.add('hidden');
    return;
  }

  emptyEl?.classList.add('hidden');
  listEl.classList.remove('hidden');

  const ctx: TaskCardContext = {
    departments: state.departments,
    users: state.users,
    projects: state.projects,
    onTaskClick: (id) => {
      void openTaskDetail(id);
    },
  };
  renderTaskList(listEl, visible, state.filter, ctx);
}

function renderFilterBar(): void {
  const bar = document.getElementById('taskFilterBar');
  if (!bar) return;
  bar.replaceChildren();

  const filters: { key: TaskFilter; label: string; icon: string }[] = [
    { key: 'all', label: 'Tất cả', icon: 'fa-layer-group' },
    { key: 'assigned', label: 'Đã giao', icon: 'fa-paper-plane' },
    { key: 'working', label: 'Đang làm', icon: 'fa-spinner' },
    { key: 'pending_review', label: 'Chờ duyệt', icon: 'fa-hourglass-half' },
    { key: 'approved', label: 'Đã duyệt', icon: 'fa-check-circle' },
    { key: 'rejected', label: 'Bị từ chối', icon: 'fa-circle-xmark' },
  ];

  filters.forEach((f) => {
    const count =
      f.key === 'all'
        ? state.tasks.length
        : state.tasks.filter((t) => t.status === f.key).length;
    const active = state.filter === f.key;
    const btn = document.createElement('button');
    btn.className = `px-3 py-1.5 rounded-lg text-[11px] font-black transition flex items-center gap-1.5 border ${
      active
        ? 'bg-violet-500/20 text-violet-200 border-violet-500/40'
        : 'bg-white/[.03] text-slate-400 border-white/[.06] hover:bg-white/[.06]'
    }`;
    btn.innerHTML = `<i class="fa-solid ${f.icon} text-[10px]"></i><span>${escHtml(
      f.label,
    )}</span><span class="opacity-60">${count}</span>`;
    btn.addEventListener('click', () => {
      state.filter = f.key;
      renderTasksSection();
    });
    bar.appendChild(btn);
  });

  const subtitle = document.getElementById('tasksSubtitle');
  if (subtitle && state.filter !== 'all') {
    const label = TASK_STATUS_MAP[state.filter]?.label ?? state.filter;
    subtitle.textContent = `Đang lọc: ${label}`;
  }
}

/* ─────────────────────────────────────────────
   OPEN TASK DETAIL (public API)
   ───────────────────────────────────────────── */
export async function openTaskDetail(taskId: string): Promise<void> {
  if (!state.currentProfile) return;
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;

  const subtasks = await fetchSubtasks(taskId);
  const submissions = await fetchSubmissionsBySubtasks(subtasks.map((s) => s.id));
  const taskSubmission = await fetchTaskSubmission(taskId);

  state.subtasks = subtasks;
  state.submissions = submissions;
  state.taskSubmission = taskSubmission;
  state.selectedTaskId = taskId;

  const canManage =
    isSuperAdmin(state.currentProfile) ||
    isDeptHead(state.currentProfile, task, state.departments);

  const handlers: TaskDetailHandlers = {
    onEdit: () => {
      safeModalClose(MODAL_IDS.detail);
      const ctx = buildWorkflowContext();
      if (ctx) setTimeout(() => openCreateTaskModal(ctx, taskId), 250);
    },
    onDelete: async () => {
      if (
        !window.confirm(
          `Xóa task "${task.title}"?\n\n⚠️ Toàn bộ subtask, submission của task này sẽ bị xóa!`,
        )
      )
        return;
      try {
        await deleteTask(task.id);
        Toast.show('Đã xóa task', { type: 'success' });
        safeModalClose(MODAL_IDS.detail);
        await refreshTasks();
      } catch (err) {
        Toast.show('Lỗi: ' + errorMessage(err), { type: 'error' });
      }
    },
    onCreateSubtask: () => {
      const ctx = buildWorkflowContext();
      if (ctx) openCreateSubtaskModal(ctx, taskId);
    },
    onDeleteSubtask: async (subtaskId) => {
      const sub = state.subtasks.find((s) => s.id === subtaskId);
      if (!sub) return;
      if (!window.confirm(`Xóa subtask "${sub.title}"?`)) return;
      try {
        await deleteSubtask(subtaskId);
        Toast.show('Đã xóa subtask', { type: 'success' });
        await openTaskDetail(taskId);
      } catch (err) {
        Toast.show('Lỗi: ' + errorMessage(err), { type: 'error' });
      }
    },
    onSubmitFile: (subtaskId) => {
      const ctx = buildWorkflowContext();
      if (ctx) openSubmitFileModal(ctx, subtaskId);
    },
    onScoreSubmission: (submissionId) => {
      const ctx = buildWorkflowContext();
      if (ctx) openScoreModal(ctx, submissionId);
    },
    onSubmitToPresident: () => {
      const ctx = buildWorkflowContext();
      if (ctx) openSubmitToPresidentModal(ctx, taskId);
    },
    onOpenPresidentReview: (tsId) => {
      const ctx = buildWorkflowContext();
      if (ctx) {
        void openPresidentReviewModal(ctx, tsId);
      }
    },
    onViewHistory: () => {
      void openTaskHistoryModal(task.id, task.title, state.users);
    },
    onClose: () => safeModalClose(MODAL_IDS.detail),
  };

  safeModalClose(MODAL_IDS.detail);
  Modal.open(MODAL_IDS.detail, null, (content) => {
    renderTaskDetail(
      content,
      {
        task,
        subtasks,
        submissions,
        taskSubmission,
        currentProfile: state.currentProfile!,
        departments: state.departments,
        users: state.users,
        projects: state.projects,
        canManage,
        isPresident: isPresident(state.currentProfile),
      },
      handlers,
    );
  });
}

/* ─────────────────────────────────────────────
   WORKFLOW CONTEXT BUILDER
   ───────────────────────────────────────────── */
function buildWorkflowContext(): WorkflowContext | null {
  if (!state.currentProfile) return null;
  return {
    currentProfile: state.currentProfile,
    departments: state.departments,
    users: state.users,
    projects: state.projects,
    tasks: state.tasks,
    subtasks: state.subtasks,
    submissions: state.submissions,
    taskSubmission: state.taskSubmission,
    refreshList: refreshTasks,
    refreshDetail: async (taskId: string) => {
      await openTaskDetail(taskId);
    },
  };
}

/* ─────────────────────────────────────────────
   UTILITY
   ───────────────────────────────────────────── */
function safeModalClose(id: string): void {
  try {
    Modal.close(id);
  } catch {
    /* ignore */
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Đã có lỗi xảy ra';
}

/* Public exports for other modules */
export { getCachedProfile } from './task-service';

/* ─────────────────────────────────────────────
   DESTROY (logout / pending / rejected)
   ───────────────────────────────────────────── */
export function destroyTasksFeature(): void {
  clearProfileCache();

  state.initialized = false;
  state.loading = false;
  state.currentProfile = null;
  state.tasks = [];
  state.subtasks = [];
  state.submissions = {};
  state.taskSubmission = null;
  state.selectedTaskId = null;
  state.filter = 'all';
  state.userDepartments = [];

  document.getElementById('tasksSection')?.remove();
  document.querySelector('[data-nav="tasks"]')?.remove();

  for (const id of Object.values(MODAL_IDS)) {
    try {
      Modal.close(id);
    } catch {
      /* ignore */
    }
  }
}
