/* ============================================================
   FPC HUB v15 · Module 5 · Task UI (render layer)
   Port từ 12-tasks.js và 12a-task-modals.js
   ============================================================ */
import { escHtml } from '../../utils';
import type {
  Task, Subtask, Submission, TaskSubmission, Profile, Department,
  TaskStatus, TaskPriority, SubtaskStatus, TaskFilter, ProjectOption,
} from './types';

/* ─────────────────────────────────────────────
   DOM HELPER
   ───────────────────────────────────────────── */
type ElAttrs = Record<string, string | number | boolean | undefined | null>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: ElAttrs | null,
  children?: (Node | string | null | undefined)[],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') node.className = String(v);
      else if (k === 'text') node.textContent = String(v);
      else if (k === 'html') node.innerHTML = String(v);
      else if (k === 'disabled' || k === 'checked' || k === 'selected' || k === 'multiple') {
        (node as unknown as Record<string, boolean>)[k] = Boolean(v);
      } else {
        node.setAttribute(k, String(v));
      }
    }
  }
  if (children) {
    for (const c of children) {
      if (c === null || c === undefined) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
  }
  return node;
}

/* ─────────────────────────────────────────────
   CONSTANTS
   ───────────────────────────────────────────── */
export const TASK_STATUS_MAP: Record<TaskStatus, { label: string; cls: string }> = {
  assigned:       { label: 'Đã giao',    cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
  working:        { label: 'Đang làm',   cls: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  pending_review: { label: 'Chờ duyệt',  cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  approved:       { label: 'Đã duyệt',   cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  rejected:       { label: 'Bị từ chối', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
};

export const SUBTASK_STATUS_MAP: Record<SubtaskStatus, { label: string; cls: string; icon: string }> = {
  todo:      { label: 'Chưa làm',     cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30', icon: 'fa-circle-dot' },
  doing:     { label: 'Đang làm',     cls: 'bg-violet-500/15 text-violet-300 border-violet-500/30', icon: 'fa-spinner' },
  submitted: { label: 'Đã nộp bài',   cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', icon: 'fa-hourglass-half' },
  scored:    { label: 'Đã chấm điểm', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', icon: 'fa-check-circle' },
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'Thấp', normal: 'Bình thường', high: 'Cao', urgent: 'Khẩn cấp',
};
const PRIORITY_COLOR: Record<TaskPriority, string> = {
  low: 'slate', normal: 'cyan', high: 'amber', urgent: 'rose',
};

/* ─────────────────────────────────────────────
   DEADLINE STYLES
   ───────────────────────────────────────────── */
export interface DeadlineStyle {
  level: string; text: string; icon: string;
  border: string; bg: string; text_cls: string;
}

export function getTaskDeadlineStyle(deadlineStr: string | null): DeadlineStyle {
  if (!deadlineStr) {
    return {
      level: 'none', text: '—', icon: 'fa-minus',
      border: 'border-slate-500/30', bg: 'bg-slate-500/10', text_cls: 'text-slate-400',
    };
  }
  const dl = new Date(deadlineStr);
  dl.setHours(23, 59, 59, 999);
  const diffMs = dl.getTime() - Date.now();
  const diffDays = diffMs / 86_400_000;

  if (diffMs < 0) {
    const daysLate = Math.abs(Math.floor(diffDays));
    if (daysLate > 3) {
      return {
        level: 'black', text: `TRỄ ${daysLate} NGÀY`, icon: 'fa-skull',
        border: 'border-slate-800', bg: 'bg-slate-900/50', text_cls: 'text-slate-300',
      };
    }
    return {
      level: 'red', text: `TRỄ ${daysLate} NGÀY`, icon: 'fa-fire',
      border: 'border-rose-500/40', bg: 'bg-rose-500/10', text_cls: 'text-rose-300',
    };
  }
  if (diffDays < 1) {
    const hoursLeft = Math.max(1, Math.floor(diffMs / 3_600_000));
    return {
      level: 'orange', text: `CÒN ${hoursLeft} GIỜ`, icon: 'fa-triangle-exclamation',
      border: 'border-orange-500/40', bg: 'bg-orange-500/10', text_cls: 'text-orange-300',
    };
  }
  if (diffDays < 3) {
    return {
      level: 'yellow', text: `CÒN ${Math.floor(diffDays)} NGÀY`, icon: 'fa-clock',
      border: 'border-amber-500/40', bg: 'bg-amber-500/10', text_cls: 'text-amber-300',
    };
  }
  return {
    level: 'green', text: `CÒN ${Math.floor(diffDays)} NGÀY`, icon: 'fa-check-circle',
    border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', text_cls: 'text-emerald-300',
  };
}

export interface SubtaskDeadlineInfo {
  text: string;
  badge: string;
}

export function getSubtaskDeadlineInfo(deadlineStr: string | null): SubtaskDeadlineInfo {
  if (!deadlineStr) {
    return {
      text: 'Không thời hạn',
      badge: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
    };
  }
  const dl = new Date(deadlineStr);
  dl.setHours(23, 59, 59, 999);
  const diffMs = dl.getTime() - Date.now();
  const diffDays = diffMs / 86_400_000;

  if (diffMs < 0) {
    const daysLate = Math.max(1, Math.abs(Math.floor(diffDays)));
    return {
      text: `🔴 Trễ ${daysLate} ngày`,
      badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    };
  }
  if (diffDays < 1) {
    const hours = Math.max(1, Math.floor(diffMs / 3_600_000));
    return {
      text: `🟡 Còn ${hours} giờ`,
      badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    };
  }
  if (diffDays < 3) {
    return {
      text: `🟡 Còn ${Math.floor(diffDays)} ngày`,
      badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    };
  }
  return {
    text: `🟢 Còn ${Math.floor(diffDays)} ngày`,
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  };
}

/* ─────────────────────────────────────────────
   FORMATTERS
   ───────────────────────────────────────────── */
export function fmtBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function getUserDisplay(
  userId: string,
  users: Profile[],
): { name: string; initial: string } {
  const u = users.find(x => x.id === userId);
  if (!u) return { name: `Thành viên ${userId.slice(0, 5)}`, initial: 'U' };
  const name = u.display_name || u.email;
  return { name, initial: (name[0] || 'U').toUpperCase() };
}

/* ─────────────────────────────────────────────
   TASK LIST RENDER
   ───────────────────────────────────────────── */
export interface TaskCardContext {
  departments: Department[];
  users: Profile[];
  projects: ProjectOption[];
  onTaskClick: (taskId: string) => void;
}

export function buildTaskCard(task: Task, ctx: TaskCardContext): HTMLElement {
  const dl = getTaskDeadlineStyle(task.deadline_current || task.deadline_original);
  const st = TASK_STATUS_MAP[task.status] ?? TASK_STATUS_MAP.assigned;
  const dept = ctx.departments.find(d => d.id === task.department_id);
  const deptColor = dept?.color || 'violet';
  const deptName = dept?.name || 'Không rõ ban';
  const head = dept?.head_id
    ? getUserDisplay(dept.head_id, ctx.users)
    : null;
  const project = task.project_id
    ? ctx.projects.find(p => p.id === task.project_id)
    : null;

  const card = el('article', {
    class: `glass-card rounded-2xl p-4 cursor-pointer transition hover:border-${deptColor}-500/30 group`,
  });
  card.addEventListener('click', () => ctx.onTaskClick(task.id));

  const headRow = el('div', { class: 'flex items-start justify-between gap-3 mb-3' });
  const titleCol = el('div', { class: 'min-w-0 flex-1' });

  const titleRow = el('div', { class: 'flex items-center gap-2 flex-wrap mb-1' });
  titleRow.appendChild(el('h3', {
    class: 'font-black text-white text-base leading-tight',
    text: task.title,
  }));
  if (task.reject_count > 0) {
    titleRow.appendChild(el('span', {
      class: 'text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 font-black',
      text: `✕ ${task.reject_count} lần từ chối`,
    }));
  }
  titleCol.appendChild(titleRow);
  titleCol.appendChild(el('p', {
    class: 'text-xs text-slate-500 line-clamp-2',
    text: task.description || 'Không có mô tả',
  }));

  const statusBadge = el('span', {
    class: `shrink-0 text-[10px] px-2.5 py-1 rounded-md font-black uppercase tracking-widest border ${st.cls}`,
    text: st.label,
  });

  headRow.append(titleCol, statusBadge);
  card.appendChild(headRow);

  const info = el('div', { class: 'grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3' });

  const banBox = el('div', {
    class: 'flex items-center gap-2 p-2 rounded-lg bg-white/[.02] border border-white/[.05]',
  });
  if (project) {
    banBox.innerHTML = `
      <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center shrink-0">
        <i class="fa-solid fa-layer-group text-white text-[10px]"></i>
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-[10px] text-slate-500 font-bold tracking-widest uppercase">Dự án · Ban</div>
        <div class="text-xs font-bold text-white truncate" title="${escHtml(project.name)} · ${escHtml(deptName)}">${escHtml(project.name)}</div>
      </div>`;
  } else {
    banBox.innerHTML = `
      <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-${deptColor}-500 to-${deptColor}-600 flex items-center justify-center shrink-0">
        <i class="fa-solid ${escHtml(dept?.icon || 'fa-users')} text-white text-[10px]"></i>
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-[10px] text-slate-500 font-bold tracking-widest uppercase">Ban phụ trách</div>
        <div class="text-xs font-bold text-white truncate">${escHtml(deptName)}</div>
      </div>`;
  }

  const dlBox = el('div', { class: `flex items-center gap-2 p-2 rounded-lg ${dl.bg} border ${dl.border}` });
  dlBox.innerHTML = `
    <i class="fa-solid ${dl.icon} ${dl.text_cls} text-sm"></i>
    <div class="min-w-0 flex-1">
      <div class="text-[10px] text-slate-500 font-bold tracking-widest uppercase">Deadline</div>
      <div class="text-xs font-bold ${dl.text_cls} truncate">${escHtml(dl.text)}</div>
    </div>`;

  info.append(banBox, dlBox);
  card.appendChild(info);

  const foot = el('div', {
    class: 'pt-3 border-t border-white/[.06] flex justify-between items-center gap-2',
  });

  const headInfo = el('div', { class: 'flex items-center gap-2' });
  if (head) {
    headInfo.innerHTML = `
      <div class="w-6 h-6 rounded-md bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center font-black text-white text-[9px]">${escHtml(head.initial)}</div>
      <div class="text-[11px]">
        <span class="text-slate-500">Trưởng ban: </span>
        <span class="font-bold text-white">${escHtml(head.name)}</span>
      </div>`;
  } else {
    headInfo.innerHTML = '<span class="text-[11px] text-slate-500 italic">Chưa có trưởng ban</span>';
  }

  const dateInfo = el('span', {
    class: 'text-[10px] text-slate-500',
    text: new Date(task.created_at).toLocaleDateString('vi-VN'),
  });

  foot.append(headInfo, dateInfo);
  card.appendChild(foot);

  return card;
}

export function renderTaskList(
  container: HTMLElement,
  tasks: Task[],
  filter: TaskFilter,
  ctx: TaskCardContext,
): void {
  container.replaceChildren();

  const visible = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);
  if (!visible.length) return;

  const frag = document.createDocumentFragment();
  visible.forEach(t => frag.appendChild(buildTaskCard(t, ctx)));
  container.appendChild(frag);
}

/* ─────────────────────────────────────────────
   TASK DETAIL RENDER
   ───────────────────────────────────────────── */
export interface TaskDetailContext {
  task: Task;
  subtasks: Subtask[];
  submissions: Record<string, Submission[]>;
  taskSubmission: TaskSubmission | null;
  currentProfile: Profile;
  departments: Department[];
  users: Profile[];
  projects: ProjectOption[];
  canManage: boolean;
  isPresident: boolean;
}

export interface TaskDetailHandlers {
  onEdit: () => void;
  onDelete: () => Promise<void>;
  onCreateSubtask: () => void;
  onDeleteSubtask: (subtaskId: string) => Promise<void>;
  onSubmitFile: (subtaskId: string) => void;
  onScoreSubmission: (submissionId: string) => void;
  onSubmitToPresident: () => void;
  onOpenPresidentReview: (taskSubmissionId: string) => void;
  onViewHistory: () => void;
  onClose: () => void;
}

export function renderTaskDetail(
  content: HTMLElement,
  ctx: TaskDetailContext,
  handlers: TaskDetailHandlers,
): void {
  content.replaceChildren();

  const { task, currentProfile, departments, taskSubmission } = ctx;
  const dl = getTaskDeadlineStyle(task.deadline_current || task.deadline_original);
  const st = TASK_STATUS_MAP[task.status] ?? TASK_STATUS_MAP.assigned;
  const dept = departments.find(d => d.id === task.department_id);
  const project = task.project_id
    ? ctx.projects.find(p => p.id === task.project_id)
    : null;
  const isPresident = ctx.isPresident;

  /* ── Header ── */
  const header = el('div', { class: 'shrink-0 border-b border-white/[.06] bg-white/[.02]' });
  const headerRow = el('div', { class: 'flex items-start justify-between gap-3 px-6 py-5' });

  const titleBox = el('div', { class: 'min-w-0 flex-1' });
  const titleRow = el('div', { class: 'flex items-center gap-2 flex-wrap mb-2' });
  titleRow.appendChild(el('h2', { class: 'font-black text-white text-lg leading-tight', text: task.title }));
  titleRow.appendChild(el('span', {
    class: `text-[10px] px-2 py-0.5 rounded-md font-black tracking-widest uppercase border ${st.cls}`,
    text: st.label,
  }));
  if (task.reject_count > 0) {
    titleRow.appendChild(el('span', {
      class: 'text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 font-black',
      text: `✕ ${task.reject_count}`,
    }));
  }
  titleBox.appendChild(titleRow);

  const metaRow = el('div', { class: 'flex items-center gap-3 flex-wrap text-xs text-slate-500' });
  if (dept) {
    metaRow.appendChild(el('span', { class: 'flex items-center gap-1.5' }, [
      el('i', { class: `fa-solid ${dept.icon || 'fa-users'} text-[10px]` }),
      el('span', { text: dept.name }),
    ]));
  }
  if (project) {
    metaRow.appendChild(el('span', { class: 'flex items-center gap-1.5 text-violet-400' }, [
      el('i', { class: 'fa-solid fa-layer-group text-[10px]' }),
      el('span', { text: project.name }),
    ]));
  }
  if (metaRow.children.length) titleBox.appendChild(metaRow);

  const closeBtn = el('button', {
    class: 'w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition shrink-0',
    html: '<i class="fa-solid fa-xmark text-sm"></i>',
    type: 'button',
  }) as HTMLButtonElement;
  closeBtn.addEventListener('click', handlers.onClose);

  headerRow.append(titleBox, closeBtn);
  header.appendChild(headerRow);
  content.appendChild(header);

  /* ── Body ── */
  const body = el('div', { class: 'flex-1 overflow-y-auto scrollbar px-6 py-5 space-y-5 min-h-0' });

  const dlCard = el('div', { class: `p-4 rounded-2xl ${dl.bg} border-2 ${dl.border}` });
  dlCard.innerHTML = `
    <div class="flex items-center gap-3">
      <i class="fa-solid ${dl.icon} ${dl.text_cls} text-2xl"></i>
      <div class="flex-1 min-w-0">
        <div class="text-[10px] text-slate-500 font-black tracking-widest uppercase">Deadline</div>
        <div class="text-lg font-black ${dl.text_cls}">${escHtml(dl.text)}</div>
        <div class="text-[11px] text-slate-500 mt-0.5">${escHtml(
          new Date(task.deadline_current || task.deadline_original || Date.now())
            .toLocaleDateString('vi-VN', {
              weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
            }),
        )}</div>
      </div>
    </div>`;
  body.appendChild(dlCard);

  if (task.description) {
    const sec = el('div');
    sec.appendChild(el('div', {
      class: 'text-[10px] font-black text-slate-400 tracking-widest uppercase mb-2',
      text: 'Mô tả',
    }));
    sec.appendChild(el('p', {
      class: 'text-sm text-slate-300 leading-relaxed whitespace-pre-wrap',
      text: task.description,
    }));
    body.appendChild(sec);
  }

  if (task.requirement) {
    const sec = el('div');
    sec.appendChild(el('div', {
      class: 'text-[10px] font-black text-slate-400 tracking-widest uppercase mb-2',
      text: 'Yêu cầu đầu ra',
    }));
    sec.appendChild(el('p', {
      class: 'text-sm text-slate-300 leading-relaxed whitespace-pre-wrap',
      text: task.requirement,
    }));
    body.appendChild(sec);
  }

  const pri = task.priority || 'normal';
  const priSec = el('div');
  priSec.appendChild(el('div', {
    class: 'text-[10px] font-black text-slate-400 tracking-widest uppercase mb-2',
    text: 'Độ ưu tiên',
  }));
  priSec.appendChild(el('span', {
    class: `text-xs px-3 py-1.5 rounded-lg bg-${PRIORITY_COLOR[pri]}-500/15 text-${PRIORITY_COLOR[pri]}-300 border border-${PRIORITY_COLOR[pri]}-500/30 font-black`,
    text: PRIORITY_LABEL[pri],
  }));
  body.appendChild(priSec);

  /* ── Task submission banner ── */
  if (taskSubmission) {
    if (taskSubmission.status === 'pending') {
      const banner = el('div', {
        class: 'p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 flex items-start justify-between gap-3 flex-wrap',
      });
      const left = el('div', { class: 'min-w-0 flex-1' }, [
        el('div', { class: 'flex items-center gap-2 mb-1' }, [
          el('span', { class: 'w-2 h-2 rounded-full bg-amber-400 animate-ping' }),
          el('h4', { class: 'text-sm font-black text-amber-300', text: 'Đã nộp lên Chủ nhiệm — Chờ phê duyệt' }),
        ]),
        el('p', {
          class: 'text-xs text-slate-400',
          text: taskSubmission.summary ? `Tóm tắt: "${taskSubmission.summary}"` : 'Trưởng ban đã tổng hợp sản phẩm và bảng điểm.',
        }),
      ]);
      banner.appendChild(left);
      if (isPresident) {
        const reviewBtn = el('button', {
          class: 'px-4 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-violet-600 text-white text-xs font-black shadow-neon-pink hover:opacity-95 transition flex items-center gap-2',
          type: 'button',
        }, [
          el('i', { class: 'fa-solid fa-gavel text-[11px]' }),
          el('span', { text: 'Duyệt sản phẩm ngay' }),
        ]) as HTMLButtonElement;
        reviewBtn.addEventListener('click', () => handlers.onOpenPresidentReview(taskSubmission.id));
        banner.appendChild(reviewBtn);
      }
      body.appendChild(banner);
    } else if (taskSubmission.status === 'approved') {
      const banner = el('div', {
        class: 'p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3',
      });
      banner.innerHTML = `
        <div class="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
          <i class="fa-solid fa-circle-check text-sm"></i>
        </div>
        <div class="flex-1 min-w-0">
          <h4 class="text-xs font-black text-emerald-300 uppercase tracking-wider">Chủ nhiệm đã duyệt nghiệm thu task</h4>
          <p class="text-[11px] text-slate-400 mt-0.5">${
            escHtml(taskSubmission.president_note || 'Điểm đóng góp của các thành viên đã được tự động lưu.')
          }</p>
        </div>`;
      body.appendChild(banner);
    } else if (taskSubmission.status === 'rejected') {
      const banner = el('div', {
        class: 'p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30',
      });
      banner.innerHTML = `
        <h4 class="text-xs font-black text-rose-300 uppercase tracking-wider flex items-center gap-1.5">
          <i class="fa-solid fa-circle-xmark text-sm"></i>
          <span>Chủ nhiệm đã từ chối sản phẩm — Cần làm lại</span>
        </h4>
        <p class="text-xs text-rose-200 mt-1">${
          escHtml(taskSubmission.reject_reason || 'Sản phẩm chưa đạt yêu cầu.')
        }</p>`;
      body.appendChild(banner);
    }
  }

  /* ── Subtask section ── */
  const subSection = renderSubtaskSection(ctx, handlers);
  body.appendChild(subSection);

  content.appendChild(body);

  /* ── Footer ── */
  const footer = el('div', {
    class: 'shrink-0 px-6 py-4 border-t border-white/[.06] bg-black/20 flex justify-between items-center gap-3 flex-wrap',
  });

  const meta = el('div', {
    class: 'text-[11px] text-slate-500',
    text: `Tạo ${new Date(task.created_at).toLocaleDateString('vi-VN')}`,
  });

  const btnWrap = el('div', { class: 'flex gap-2 flex-wrap' });

  if (ctx.canManage) {
    const editBtn = el('button', {
      class: 'px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-300 transition flex items-center gap-1.5',
      type: 'button',
    }, [
      el('i', { class: 'fa-solid fa-pen text-[10px]' }),
      el('span', { text: 'Sửa' }),
    ]) as HTMLButtonElement;
    editBtn.addEventListener('click', handlers.onEdit);
    btnWrap.appendChild(editBtn);
  }

  if (currentProfile.role === 'super_admin') {
    const delBtn = el('button', {
      class: 'px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-xs font-bold text-rose-300 border border-rose-500/30 transition flex items-center gap-1.5',
      type: 'button',
    }, [
      el('i', { class: 'fa-solid fa-trash text-[10px]' }),
      el('span', { text: 'Xóa' }),
    ]) as HTMLButtonElement;
    delBtn.addEventListener('click', () => { void handlers.onDelete(); });
    btnWrap.appendChild(delBtn);
  }

  /* Nút Lịch sử — hiện cho mọi role */
  const historyBtn = el('button', {
    class: 'px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-300 transition flex items-center gap-1.5',
    type: 'button',
  }, [
    el('i', { class: 'fa-solid fa-clock-rotate-left text-[10px]' }),
    el('span', { text: 'Lịch sử' }),
  ]) as HTMLButtonElement;
  historyBtn.addEventListener('click', handlers.onViewHistory);
  btnWrap.appendChild(historyBtn);

  const closeFinal = el('button', {
    class: 'px-4 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-violet-600 text-xs font-black text-white shadow-neon-pink transition',
    type: 'button',
    text: 'Đóng',
  }) as HTMLButtonElement;
  closeFinal.addEventListener('click', handlers.onClose);
  btnWrap.appendChild(closeFinal);

  footer.append(meta, btnWrap);
  content.appendChild(footer);
}

/* ─────────────────────────────────────────────
   SUBTASK SECTION
   ───────────────────────────────────────────── */
function renderSubtaskSection(
  ctx: TaskDetailContext,
  handlers: TaskDetailHandlers,
): HTMLElement {
  const { task, subtasks, currentProfile, departments, taskSubmission } = ctx;
  const dept = departments.find(d => d.id === task.department_id);
  const isHead = dept?.head_id === currentProfile.id;
  const isPresident = ctx.isPresident;
  const totalCount = subtasks.length;
  const scoredCount = subtasks.filter(s => s.status === 'scored').length;

  const wrap = el('div', { class: 'space-y-4 pt-3 border-t border-white/[.06]' });

  const headBox = el('div', { class: 'flex items-center justify-between gap-3 flex-wrap pt-2' });
  const titlePart = el('div', { class: 'flex items-center gap-2' }, [
    el('span', {
      class: 'text-[10px] font-black text-slate-400 tracking-widest uppercase',
      text: 'Công việc nhỏ (Subtasks)',
    }),
    totalCount > 0
      ? el('span', {
          class: 'text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-slate-400 font-bold border border-white/10',
          text: `${scoredCount}/${totalCount} đã chấm`,
        })
      : null,
  ]);
  headBox.appendChild(titlePart);

  const actionGroup = el('div', { class: 'flex items-center gap-2 flex-wrap' });

  if (isHead || isPresident) {
    const addBtn = el('button', {
      class: 'px-3 py-1.5 rounded-xl bg-violet-500/20 hover:bg-violet-500/30 text-violet-200 border border-violet-500/40 text-xs font-black transition flex items-center gap-1.5',
      type: 'button',
    }, [
      el('i', { class: 'fa-solid fa-plus text-[10px]' }),
      el('span', { text: 'Chia subtask' }),
    ]) as HTMLButtonElement;
    addBtn.addEventListener('click', handlers.onCreateSubtask);
    actionGroup.appendChild(addBtn);
  }

  const canSubmitToPresident =
    (isHead || isPresident) &&
    totalCount > 0 &&
    task.status !== 'approved' &&
    (!taskSubmission || taskSubmission.status === 'rejected');
  if (canSubmitToPresident) {
    const submitAllBtn = el('button', {
      class: 'px-3 py-1.5 rounded-xl bg-gradient-to-r from-pink-600 to-violet-600 text-white text-xs font-black shadow-neon-pink hover:opacity-95 transition flex items-center gap-1.5',
      type: 'button',
    }, [
      el('i', { class: 'fa-solid fa-paper-plane text-[10px]' }),
      el('span', { text: 'Gửi Chủ nhiệm duyệt' }),
    ]) as HTMLButtonElement;
    submitAllBtn.addEventListener('click', handlers.onSubmitToPresident);
    actionGroup.appendChild(submitAllBtn);
  }

  headBox.appendChild(actionGroup);
  wrap.appendChild(headBox);

  if (!subtasks.length) {
    const empty = el('div', {
      class: 'text-center py-10 px-4 rounded-2xl bg-white/[.02] border border-dashed border-white/[.08]',
    });
    empty.innerHTML = `
      <div class="w-12 h-12 rounded-xl bg-white/[.03] mx-auto mb-2 flex items-center justify-center text-slate-600 text-lg">
        <i class="fa-solid fa-list-check"></i>
      </div>
      <p class="text-xs font-bold text-slate-400">Chưa có công việc nhỏ nào</p>
      <p class="text-[11px] text-slate-500 mt-0.5 max-w-sm mx-auto">${
        escHtml(isHead
          ? 'Hãy nhấn "Chia subtask" để phân công các phần việc cụ thể cho thành viên trong ban.'
          : 'Trưởng ban sẽ chia nhỏ nhiệm vụ và giao cho bạn tại đây.')
      }</p>`;
    wrap.appendChild(empty);
    return wrap;
  }

  const listWrap = el('div', { class: 'space-y-3' });
  subtasks.forEach(sub => {
    listWrap.appendChild(
      renderSubtaskCard(sub, ctx, handlers, isHead, isPresident),
    );
  });
  wrap.appendChild(listWrap);
  return wrap;
}

function renderSubtaskCard(
  subtask: Subtask,
  ctx: TaskDetailContext,
  handlers: TaskDetailHandlers,
  isHead: boolean,
  isPresident: boolean,
): HTMLElement {
  const currentUserId = ctx.currentProfile.id;
  const isAssignee = subtask.assignee_id === currentUserId;
  const canManage = isHead || isPresident;
  const st = SUBTASK_STATUS_MAP[subtask.status] ?? SUBTASK_STATUS_MAP.todo;
  const dl = getSubtaskDeadlineInfo(subtask.deadline);
  const assignee = getUserDisplay(subtask.assignee_id, ctx.users);
  const subs = ctx.submissions[subtask.id] ?? [];
  const latest = subs[0] ?? null;

  const card = el('div', {
    class: 'p-4 rounded-2xl glass-card border border-white/[.06] hover:border-white/15 transition space-y-3',
  });

  const titleRow = el('div', { class: 'flex items-center gap-2 flex-wrap mb-1' }, [
    el('h4', { class: 'text-sm font-black text-white leading-snug', text: subtask.title }),
    el('span', {
      class: `text-[9px] px-2 py-0.5 rounded-md font-black uppercase tracking-wider border ${st.cls} flex items-center gap-1`,
    }, [
      el('i', { class: `fa-solid ${st.icon} text-[8px]` }),
      el('span', { text: st.label }),
    ]),
  ]);
  card.appendChild(titleRow);

  if (subtask.description) {
    card.appendChild(el('p', {
      class: 'text-xs text-slate-400 line-clamp-2 leading-relaxed',
      text: subtask.description,
    }));
  }

  const metaRow = el('div', {
    class: 'flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-white/[.04]',
  });

  const assBadge = el('div', { class: 'flex items-center gap-2' });
  assBadge.innerHTML = `
    <div class="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-white text-[10px] font-black shrink-0">
      ${escHtml(assignee.initial)}
    </div>
    <div class="text-xs">
      <span class="text-slate-500 font-bold">Giao cho: </span>
      <span class="text-white font-bold">${escHtml(assignee.name)}</span>
      ${isAssignee ? '<span class="ml-1.5 text-[9px] px-1.5 py-0.5 rounded bg-pink-500/15 text-pink-300 font-black border border-pink-500/30">BẠN</span>' : ''}
    </div>`;

  const dlBadge = el('div', {
    class: `text-[10px] px-2.5 py-1 rounded-lg font-bold border ${dl.badge} flex items-center gap-1.5`,
  }, [
    el('span', { text: dl.text }),
    subtask.deadline
      ? el('span', {
          class: 'opacity-60 text-[9px]',
          text: `(${new Date(subtask.deadline).toLocaleDateString('vi-VN')})`,
        })
      : null,
  ]);

  metaRow.append(assBadge, dlBadge);
  card.appendChild(metaRow);

  if (latest) {
    const subBox = el('div', {
      class: `p-3 rounded-xl ${latest.is_rejected ? 'bg-rose-500/[.06] border border-rose-500/20' : 'bg-black/30 border border-white/[.06]'} space-y-2`,
    });

    const subHead = el('div', { class: 'flex items-center justify-between gap-2 text-xs flex-wrap' });
    const subTitle = el('div', { class: 'flex items-center gap-2' }, [
      el('i', { class: 'fa-solid fa-file-arrow-up text-violet-400 text-xs' }),
      el('span', { class: 'font-bold text-white', text: 'Bài nộp của thành viên' }),
      latest.is_late
        ? el('span', {
            class: 'text-[9px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-black',
            text: `⚠️ Trễ ${latest.late_days || 1} ngày`,
          })
        : el('span', {
            class: 'text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold',
            text: 'Đúng hạn',
          }),
    ]);
    const subTime = el('span', {
      class: 'text-[10px] text-slate-500',
      text: new Date(latest.submitted_at).toLocaleString('vi-VN'),
    });
    subHead.append(subTitle, subTime);
    subBox.appendChild(subHead);

    const fileCard = el('div', {
      class: 'flex items-center justify-between gap-2 p-2 rounded-lg bg-white/[.03] border border-white/[.06]',
    });
    fileCard.innerHTML = `
      <div class="flex items-center gap-2 min-w-0 flex-1">
        <i class="fa-solid fa-paperclip text-slate-400 text-xs"></i>
        <span class="text-xs font-bold text-slate-200 truncate">${escHtml(latest.file_name || 'Tệp đính kèm')}</span>
        ${latest.file_size ? `<span class="text-[10px] text-slate-500 shrink-0">${escHtml(fmtBytes(latest.file_size))}</span>` : ''}
      </div>
      <a href="${escHtml(latest.file_url || '#')}" target="_blank" rel="noopener noreferrer"
         class="px-2.5 py-1 rounded bg-violet-500/20 hover:bg-violet-500/30 text-violet-200 text-[10px] font-bold transition shrink-0 flex items-center gap-1">
        <i class="fa-solid fa-download text-[9px]"></i>
        <span>Tải về</span>
      </a>`;
    subBox.appendChild(fileCard);

    if (latest.note) {
      subBox.appendChild(el('p', {
        class: 'text-xs text-slate-400 italic',
        text: `"${latest.note}"`,
      }));
    }

    if (subtask.status === 'scored' && latest.score != null) {
      const scoreRow = el('div', {
        class: 'flex items-center justify-between gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex-wrap',
      });
      scoreRow.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="text-sm font-black text-emerald-300">⭐ ${escHtml(String(latest.score))} / 10 điểm</span>
          <span class="text-xs text-emerald-400 font-bold">(Đóng góp: ${escHtml(String(latest.contribution_pct ?? 0))}%)</span>
        </div>
        ${latest.head_note ? `<p class="text-xs text-slate-300 w-full mt-1">Lời phê: "${escHtml(latest.head_note)}"</p>` : ''}`;
      subBox.appendChild(scoreRow);
    } else if (latest.is_rejected) {
      const rejRow = el('div', {
        class: 'p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30',
      });
      rejRow.innerHTML = `
        <div class="text-xs font-black text-rose-300 flex items-center gap-1.5">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <span>Trưởng ban yêu cầu làm lại</span>
        </div>
        ${latest.head_note ? `<p class="text-xs text-rose-200 mt-1">${escHtml(latest.head_note)}</p>` : ''}`;
      subBox.appendChild(rejRow);
    }

    card.appendChild(subBox);
  }

  const actionRow = el('div', {
    class: 'flex items-center justify-end gap-2 flex-wrap pt-2 border-t border-white/[.04]',
  });

  if ((isAssignee || isHead) && ctx.task.status !== 'approved') {
    const canSubmit =
      subtask.status === 'todo' ||
      subtask.status === 'doing' ||
      (latest && latest.is_rejected);
    if (canSubmit) {
      const submitBtn = el('button', {
        class: 'px-3 py-1.5 rounded-xl bg-gradient-to-r from-pink-600 to-violet-600 text-white text-xs font-black shadow-neon-pink hover:opacity-95 transition flex items-center gap-1.5',
        type: 'button',
      }, [
        el('i', { class: 'fa-solid fa-arrow-up-from-bracket text-[10px]' }),
        el('span', { text: latest ? 'Nộp lại bài' : 'Gửi file nộp' }),
      ]) as HTMLButtonElement;
      submitBtn.addEventListener('click', () => handlers.onSubmitFile(subtask.id));
      actionRow.appendChild(submitBtn);
    }
  }

  if (canManage && latest && ctx.task.status !== 'approved') {
    const scoreBtn = el('button', {
      class: 'px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 text-xs font-black transition flex items-center gap-1.5',
      type: 'button',
    }, [
      el('i', { class: 'fa-solid fa-star text-[10px]' }),
      el('span', { text: subtask.status === 'scored' ? 'Chấm lại' : 'Chấm điểm' }),
    ]) as HTMLButtonElement;
    scoreBtn.addEventListener('click', () => handlers.onScoreSubmission(latest.id));
    actionRow.appendChild(scoreBtn);
  }

  if (isHead && ctx.task.status !== 'approved' && subtask.status !== 'scored') {
    const delBtn = el('button', {
      class: 'w-7 h-7 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition flex items-center justify-center',
      title: 'Xóa subtask',
      type: 'button',
    }, [el('i', { class: 'fa-solid fa-trash text-[10px]' })]) as HTMLButtonElement;
    delBtn.addEventListener('click', () => { void handlers.onDeleteSubtask(subtask.id); });
    actionRow.appendChild(delBtn);
  }

  if (actionRow.children.length) card.appendChild(actionRow);
  return card;
}
