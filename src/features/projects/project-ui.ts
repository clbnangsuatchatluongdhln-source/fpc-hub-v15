import { Modal } from '@/ui/modal';
import { Toast } from '@/ui/toast';
import { el, clamp, fmtBytes, fileIcon } from '@/utils';
import { Store } from '@/core/store';
import { getFileDownloadUrl } from '@/core/storage/legacy-files';
import {
  uploadFile,
  saveFileMetadata,
  deleteFileFromStorage,
  ensureUploadPanelVisible,
  maybeHidePanel,
} from '@/features/files';
import type {
  Project,
  ProjectPhase,
  ProjectReport,
  ProjectTask,
  ProjectFile,
  PhaseStatus,
} from './types';
import {
  fetchProjectDetails,
  createReport,
  updatePhaseStatus,
  deleteProjectFileMeta,
  reloadProjectFiles,
} from './project-service';

/* ─────────────────────────────────────────────
   STORE ADAPTER
   ───────────────────────────────────────────── */
interface StoreLike {
  snapshot(): unknown;
  patch(p: Record<string, unknown>): void;
}
const S = Store as unknown as StoreLike;

interface AppStateLike {
  projects: Project[];
}

export type ProjectTab = 'overview' | 'tasks' | 'files' | 'reports';

export interface ProjectState {
  currentProjectId: string | null;
  currentTab: ProjectTab;
  tasks: ProjectTask[];
  phases: ProjectPhase[];
  reports: ProjectReport[];
  files: ProjectFile[];
  loading: boolean;
}

export const ProjectState: ProjectState = {
  currentProjectId: null,
  currentTab: 'overview',
  tasks: [],
  phases: [],
  reports: [],
  files: [],
  loading: false,
};

export function computeProjectProgress(): number {
  const { phases } = ProjectState;
  if (!phases.length) return 0;
  const done = phases.filter((p) => p.status === 'done').length;
  return Math.round((done / phases.length) * 100);
}

export async function openProjectDetail(projectId: string): Promise<void> {
  ProjectState.currentProjectId = projectId;
  ProjectState.currentTab = 'overview';
  ProjectState.tasks = [];
  ProjectState.phases = [];
  ProjectState.reports = [];
  ProjectState.files = [];

  await loadProjectData(projectId);
  renderProjectDetail();
}

export function closeProjectDetail(): void {
  ProjectState.currentProjectId = null;
  renderProjects();
}

async function loadProjectData(projectId: string): Promise<void> {
  ProjectState.loading = true;
  try {
    const data = await fetchProjectDetails(projectId);
    ProjectState.phases  = data.phases;
    ProjectState.tasks   = data.tasks;
    ProjectState.reports = data.reports;
    ProjectState.files   = data.files;
  } catch (err) {
    console.error('Load project data failed:', err);
    Toast.show(
      `Không tải được chi tiết dự án: ${err instanceof Error ? err.message : 'không rõ'}`,
      { type: 'error' },
    );
  } finally {
    ProjectState.loading = false;
  }
}

/* ─────────────────────────────────────────────
   RENDER: PROJECTS GRID
   ───────────────────────────────────────────── */
interface AccentStyle { badge: string; bar: string; text: string; }

const ACCENT: Record<'pink' | 'cyan' | 'violet' | 'amber', AccentStyle> = {
  pink:   { badge: 'bg-pink-500/10 text-pink-300 border-pink-500/25',       bar: 'from-pink-500 to-violet-500',   text: 'text-pink-300' },
  cyan:   { badge: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/25',       bar: 'from-cyan-500 to-blue-500',     text: 'text-cyan-300' },
  violet: { badge: 'bg-violet-500/10 text-violet-300 border-violet-500/25', bar: 'from-violet-500 to-pink-500',   text: 'text-violet-300' },
  amber:  { badge: 'bg-amber-500/10 text-amber-300 border-amber-500/25',    bar: 'from-amber-500 to-rose-500',    text: 'text-amber-300' },
};

export function renderProjects(searchQuery = ''): void {
  const root = document.getElementById('projectList');
  if (!root) return;

  if (ProjectState.currentProjectId) ProjectState.currentProjectId = null;

  root.className = 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4';
  root.replaceChildren();

  const q = searchQuery.toLowerCase().trim();
  const projects = (S.snapshot() as AppStateLike).projects ?? [];
  const filtered = q
    ? projects.filter((p) => p.name.toLowerCase().includes(q))
    : projects;

  if (!filtered.length) {
    const hasQuery = q.length > 0;
    root.className = '';
    const box = el('div', { class: 'glass-soft rounded-2xl p-12 text-center' });
    box.appendChild(el('i', {
      class: `fa-solid ${hasQuery ? 'fa-magnifying-glass' : 'fa-satellite'} text-3xl text-slate-700 mb-3 block`,
    }));
    box.appendChild(el('p', {
      class: 'text-slate-400 font-bold',
      text: hasQuery ? 'Không tìm thấy dự án' : 'Chưa có dự án nào',
    }));
    if (!hasQuery) {
      box.appendChild(el('p', {
        class: 'text-xs text-slate-500 mt-2',
        text: 'Nhấn "+ Tạo mới" để bắt đầu dự án đầu tiên',
      }));
    }
    root.appendChild(box);
    return;
  }

  const frag = document.createDocumentFragment();
  filtered.forEach((p) => {
    const a = ACCENT[p.accent] ?? ACCENT.violet;
    const progress = clamp((p as Project & { progress?: number }).progress ?? 0, 0, 100);

    const card = el('article', { class: 'glass-card rounded-2xl p-5 flex flex-col cursor-pointer hover:border-violet-500/30 transition' }) as HTMLElement;
    card.addEventListener('click', () => { void openProjectDetail(p.id); });

    const head = el('div', { class: 'flex justify-between items-start gap-2 mb-3' });
    head.appendChild(el('span', {
      class: `px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border ${a.badge}`,
      text: p.tag || 'Project',
    }));

    card.append(
      head,
      el('h3', { class: 'font-bold text-white text-lg leading-tight mb-1', text: p.name }),
      el('p', { class: 'text-xs text-slate-500 mb-4 line-clamp-2', text: p.description || 'Chưa có mô tả' }),
    );

    const track = el('div', { class: 'h-1.5 bg-black/40 rounded-full overflow-hidden mb-4' });
    track.appendChild(el('div', { class: `h-full rounded-full bg-gradient-to-r ${a.bar}`, style: `width:${progress}%` }));
    card.appendChild(track);

    const foot = el('div', { class: 'mt-auto pt-4 border-t border-white/[.06] flex justify-between items-center' });
    foot.append(
      el('span', { class: `text-xs font-black ${a.text}`, text: `${progress}%` }),
      el('span', { class: 'text-[10px] text-slate-500 flex items-center gap-1' }, [
        el('i', { class: 'fa-solid fa-arrow-right text-[9px]' }),
        el('span', { text: 'Chi tiết' }),
      ]),
    );
    card.appendChild(foot);

    frag.appendChild(card);
  });
  root.appendChild(frag);
}

/* ─────────────────────────────────────────────
   RENDER: DETAIL
   ───────────────────────────────────────────── */
export function renderProjectDetail(): void {
  const root = document.getElementById('projectList');
  if (!root) return;

  const project = (S.snapshot() as AppStateLike).projects.find(
    (p) => p.id === ProjectState.currentProjectId,
  );

  if (!project) {
    root.className = '';
    root.replaceChildren();
    const box = el('div', { class: 'glass-soft rounded-2xl p-12 text-center' });
    box.append(
      el('i', { class: 'fa-solid fa-circle-exclamation text-3xl text-slate-700 mb-3 block' }),
      el('p', { class: 'text-slate-400 font-bold', text: 'Không tìm thấy dự án' }),
    );
    const back = el('button', {
      class: 'mt-4 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm font-bold text-slate-300',
      text: 'Quay lại',
    }) as HTMLElement;
    back.addEventListener('click', closeProjectDetail);
    box.appendChild(back);
    root.appendChild(box);
    return;
  }

  root.className = '';
  root.replaceChildren();
  root.appendChild(buildProjectHeader(project));
  root.appendChild(buildProjectTabs());

  const contentBox = el('div', { id: 'projectTabContent', class: 'space-y-4' });
  root.appendChild(contentBox);
  renderProjectTabContent();
}

function buildProjectHeader(project: Project): HTMLElement {
  const progress = computeProjectProgress();
  const card = el('div', { class: 'glass rounded-2xl p-5 space-y-4' });

  const backRow = el('div', { class: 'flex items-center gap-2' });
  const backBtn = el('button', {
    class: 'text-xs font-bold text-slate-400 hover:text-white transition flex items-center gap-1.5',
  }) as HTMLElement;
  backBtn.append(
    el('i', { class: 'fa-solid fa-arrow-left text-[10px]' }),
    el('span', { text: 'Quay lại danh sách' }),
  );
  backBtn.addEventListener('click', closeProjectDetail);
  backRow.appendChild(backBtn);
  card.appendChild(backRow);

  const titleRow = el('div', { class: 'flex items-start justify-between gap-4 flex-wrap' });
  const titleBox = el('div', { class: 'min-w-0 flex-1' });
  titleBox.append(
    el('h2', { class: 'font-black text-white text-xl leading-tight mb-2', text: project.name }),
    el('p', { class: 'text-xs text-slate-400 line-clamp-2', text: project.description || 'Chưa có mô tả' }),
  );
  titleRow.appendChild(titleBox);

  const statusMap: Record<string, { cls: string; label: string }> = {
    active:    { cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', label: 'Đang thực hiện' },
    paused:    { cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30',       label: 'Tạm dừng' },
    completed: { cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',          label: 'Hoàn thành' },
  };
  const st = statusMap[project.status] ?? statusMap.active;
  titleRow.appendChild(el('span', {
    class: `shrink-0 text-[10px] px-2.5 py-1 rounded-md font-black uppercase tracking-widest border ${st.cls}`,
    text: st.label,
  }));
  card.appendChild(titleRow);

  const metaGrid = el('div', { class: 'grid grid-cols-1 sm:grid-cols-3 gap-3' });

  const banBox = el('div', { class: 'p-3 rounded-xl bg-white/[.02] border border-white/[.05]' });
  banBox.append(
    el('div', { class: 'text-[10px] text-slate-500 font-bold tracking-widest uppercase mb-1', text: 'Ban phụ trách' }),
    el('div', { class: 'text-sm font-bold text-white truncate', text: project.department_id ? 'Đã gán ban' : 'Dự án CLB' }),
  );
  metaGrid.appendChild(banBox);

  const deadlineBox = el('div', { class: 'p-3 rounded-xl bg-white/[.02] border border-white/[.05]' });
  deadlineBox.append(
    el('div', { class: 'text-[10px] text-slate-500 font-bold tracking-widest uppercase mb-1', text: 'Deadline' }),
    el('div', {
      class: 'text-sm font-bold text-white',
      text: project.deadline ? new Date(project.deadline).toLocaleDateString('vi-VN') : '—',
    }),
  );
  metaGrid.appendChild(deadlineBox);

  const progressBox = el('div', { class: 'p-3 rounded-xl bg-white/[.02] border border-white/[.05]' });
  progressBox.appendChild(el('div', { class: 'text-[10px] text-slate-500 font-bold tracking-widest uppercase mb-1', text: 'Tiến độ' }));
  const progressRow = el('div', { class: 'flex items-center gap-2' });
  const bar = el('div', { class: 'flex-1 h-1.5 bg-black/40 rounded-full overflow-hidden' });
  bar.appendChild(el('div', {
    class: 'h-full rounded-full bg-gradient-to-r from-violet-500 to-pink-500',
    style: `width:${progress}%`,
  }));
  progressRow.append(bar, el('span', { class: 'text-xs font-black text-white shrink-0', text: `${progress}%` }));
  progressBox.appendChild(progressRow);
  metaGrid.appendChild(progressBox);

  card.appendChild(metaGrid);
  return card;
}

function buildProjectTabs(): HTMLElement {
  const wrap = el('div', { class: 'glass rounded-2xl p-2 flex flex-wrap gap-1' });

  const tabs: { k: ProjectTab; icon: string; label: string }[] = [
    { k: 'overview', icon: 'fa-circle-info',  label: 'Tổng quan' },
    { k: 'tasks',    icon: 'fa-list-check',   label: `Công việc (${ProjectState.tasks.length})` },
    { k: 'files',    icon: 'fa-folder-open',  label: `Tài liệu (${ProjectState.files.length})` },
    { k: 'reports',  icon: 'fa-chart-line',   label: `Báo cáo (${ProjectState.reports.length})` },
  ];

  tabs.forEach((t) => {
    const active = ProjectState.currentTab === t.k;
    const btn = el('button', {
      class: `px-3.5 py-2 rounded-lg text-xs font-black transition flex items-center gap-1.5 ${
        active
          ? 'bg-gradient-to-r from-pink-600 to-violet-600 text-white shadow-neon-pink'
          : 'text-slate-400 hover:text-white hover:bg-white/[.04]'
      }`,
    }) as HTMLElement;
    btn.append(
      el('i', { class: `fa-solid ${t.icon} text-[10px]` }),
      el('span', { text: t.label }),
    );
    btn.addEventListener('click', () => {
      ProjectState.currentTab = t.k;
      renderProjectDetail();
    });
    wrap.appendChild(btn);
  });

  return wrap;
}

function renderProjectTabContent(): void {
  const box = document.getElementById('projectTabContent');
  if (!box) return;
  box.replaceChildren();

  if (ProjectState.loading) {
    box.append(
      el('div', { class: 'glass-soft rounded-2xl h-32 skel' }),
      el('div', { class: 'glass-soft rounded-2xl h-32 skel' }),
    );
    return;
  }

  switch (ProjectState.currentTab) {
    case 'overview': renderOverviewTab(box); break;
    case 'tasks':    renderTasksTab(box);    break;
    case 'files':    renderFilesTab(box);    break;
    case 'reports':  renderReportsTab(box);  break;
  }
}

/* ─────────────────────────────────────────────
   TAB 1: OVERVIEW
   ───────────────────────────────────────────── */
function renderOverviewTab(box: HTMLElement): void {
  const sec = el('div', { class: 'glass rounded-2xl p-5 space-y-4' });

  const headRow = el('div', { class: 'flex items-center justify-between gap-3 flex-wrap' });
  const title = el('h3', { class: 'font-black text-white text-sm flex items-center gap-2' });
  title.append(
    el('i', { class: 'fa-solid fa-diagram-project text-violet-400' }),
    el('span', { text: 'Giai đoạn dự án' }),
  );
  headRow.append(title, el('span', {
    class: 'text-[10px] text-slate-500 font-bold',
    text: `${ProjectState.phases.length} giai đoạn`,
  }));
  sec.appendChild(headRow);

  if (!ProjectState.phases.length) {
    sec.appendChild(el('div', {
      class: 'text-center py-8 text-slate-500 text-xs italic',
      text: 'Chưa có giai đoạn nào',
    }));
    box.appendChild(sec);
    return;
  }

  const list = el('div', { class: 'space-y-2' });
  ProjectState.phases.forEach((phase, idx) => list.appendChild(buildPhaseRow(phase, idx)));
  sec.appendChild(list);
  box.appendChild(sec);
}

function buildPhaseRow(phase: ProjectPhase, idx: number): HTMLElement {
  const statusMap: Record<PhaseStatus, { cls: string; label: string; icon: string }> = {
    pending: { cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30',       label: 'Chưa bắt đầu', icon: 'fa-circle' },
    doing:   { cls: 'bg-violet-500/15 text-violet-300 border-violet-500/30',    label: 'Đang làm',     icon: 'fa-spinner' },
    done:    { cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', label: 'Hoàn thành',   icon: 'fa-check-circle' },
  };
  const st = statusMap[phase.status] ?? statusMap.pending;

  const row = el('div', { class: 'flex items-start gap-3 p-3 rounded-xl bg-white/[.02] border border-white/[.05]' });
  row.appendChild(el('div', {
    class: 'w-7 h-7 rounded-lg bg-violet-500/20 text-violet-300 flex items-center justify-center font-black text-xs shrink-0',
    text: String(idx + 1),
  }));

  const info = el('div', { class: 'flex-1 min-w-0' });
  const nameRow = el('div', { class: 'flex items-center gap-2 flex-wrap mb-1' });
  const badge = el('span', { class: `text-[9px] px-1.5 py-0.5 rounded border font-black uppercase tracking-wider ${st.cls}` });
  badge.append(
    el('i', { class: `fa-solid ${st.icon} text-[8px] mr-1` }),
    el('span', { text: st.label }),
  );
  nameRow.append(
    el('h4', { class: 'text-sm font-bold text-white', text: phase.name }),
    badge,
  );
  info.appendChild(nameRow);

  const dateRange: string[] = [];
  if (phase.start_date) dateRange.push(new Date(phase.start_date).toLocaleDateString('vi-VN'));
  if (phase.end_date)   dateRange.push(new Date(phase.end_date).toLocaleDateString('vi-VN'));
  if (dateRange.length) info.appendChild(el('p', { class: 'text-[11px] text-slate-500', text: dateRange.join(' → ') }));
  row.appendChild(info);

  const select = el('select', {
    class: 'bg-black/40 border border-white/[.08] rounded-lg px-2 py-1.5 text-[10px] font-bold text-white cursor-pointer shrink-0',
  }) as HTMLSelectElement;
  (['pending', 'doing', 'done'] as PhaseStatus[]).forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s === 'pending' ? 'Chưa bắt đầu' : s === 'doing' ? 'Đang làm' : 'Hoàn thành';
    if (phase.status === s) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => {
    void handleUpdatePhase(phase.id, select.value as PhaseStatus);
  });
  row.appendChild(select);

  return row;
}

async function handleUpdatePhase(phaseId: string, newStatus: PhaseStatus): Promise<void> {
  try {
    await updatePhaseStatus(phaseId, newStatus);
    const p = ProjectState.phases.find((x) => x.id === phaseId);
    if (p) p.status = newStatus;
    Toast.show('Đã cập nhật giai đoạn', { type: 'success', timeout: 2000 });
    renderProjectDetail();
  } catch (err) {
    console.error('Update phase status failed:', err);
    Toast.show(`Lỗi: ${err instanceof Error ? err.message : 'không rõ'}`, { type: 'error' });
  }
}

/* ─────────────────────────────────────────────
   TAB 2: TASKS
   ───────────────────────────────────────────── */
function renderTasksTab(box: HTMLElement): void {
  const sec = el('div', { class: 'glass rounded-2xl p-5 space-y-4' });

  const headRow = el('div', { class: 'flex items-center justify-between gap-3 flex-wrap' });
  const title = el('h3', { class: 'font-black text-white text-sm flex items-center gap-2' });
  title.append(
    el('i', { class: 'fa-solid fa-list-check text-violet-400' }),
    el('span', { text: 'Công việc trong dự án' }),
  );
  headRow.append(title, el('span', {
    class: 'text-[10px] text-slate-500 font-bold',
    text: `${ProjectState.tasks.length} công việc`,
  }));
  sec.appendChild(headRow);

  if (!ProjectState.tasks.length) {
    const empty = el('div', { class: 'text-center py-8' });
    empty.append(
      el('i', { class: 'fa-solid fa-clipboard-list text-2xl text-slate-700 mb-2 block' }),
      el('p', { class: 'text-xs text-slate-500', text: 'Chưa có công việc nào.' }),
    );
    sec.appendChild(empty);
    box.appendChild(sec);
    return;
  }

  const list = el('div', { class: 'space-y-2' });
  ProjectState.tasks.forEach((t) => {
    const row = el('div', {
      class: 'flex items-center gap-3 p-3 rounded-xl bg-white/[.02] border border-white/[.05] hover:bg-white/[.04] transition cursor-pointer',
    });

    const statusMap: Record<string, string> = {
      assigned: 'Đã giao',
      working: 'Đang làm',
      pending_review: 'Chờ duyệt',
      approved: 'Đã duyệt',
      rejected: 'Từ chối',
    };

    row.appendChild(el('div', { class: 'w-2 h-2 rounded-full shrink-0 bg-emerald-500' }));

    const info = el('div', { class: 'flex-1 min-w-0' });
    info.append(
      el('div', { class: 'text-sm font-bold text-white truncate', text: t.title }),
      el('div', {
        class: 'text-[10px] text-slate-500',
        text: t.deadline_current || t.deadline_original || '—',
      }),
    );
    row.appendChild(info);

    row.appendChild(el('span', {
      class: 'text-[10px] px-2 py-0.5 rounded border border-slate-500/30 bg-slate-500/10 text-slate-300 font-bold shrink-0',
      text: statusMap[t.status] ?? t.status,
    }));

    row.addEventListener('click', () => {
      const w = window as unknown as { openTaskDetail?: (id: string) => void };
      if (typeof w.openTaskDetail === 'function') w.openTaskDetail(t.id);
    });

    list.appendChild(row);
  });
  sec.appendChild(list);
  box.appendChild(sec);
}

/* ─────────────────────────────────────────────
   TAB 3: FILES
   ───────────────────────────────────────────── */
function renderFilesTab(box: HTMLElement): void {
  const sec = el('div', { class: 'glass rounded-2xl p-5 space-y-4' });

  const headerRow = el('div', { class: 'flex items-center justify-between gap-3 flex-wrap' });
  const title = el('h3', { class: 'font-black text-white text-sm flex items-center gap-2' });
  title.append(
    el('i', { class: 'fa-solid fa-folder-open text-cyan-400' }),
    el('span', { text: 'Tài liệu dự án' }),
    el('span', { class: 'text-[10px] text-slate-500 font-bold', text: `(${ProjectState.files.length})` }),
  );
  headerRow.appendChild(title);

  const uploadBtn = el('button', {
    class: 'px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-xs font-black shadow-lg hover:opacity-95 transition flex items-center gap-1.5',
  }) as HTMLElement;
  uploadBtn.append(
    el('i', { class: 'fa-solid fa-cloud-arrow-up text-[10px]' }),
    el('span', { text: 'Upload file' }),
  );
  uploadBtn.addEventListener('click', () => {
    if (ProjectState.currentProjectId) openProjectFileUpload(ProjectState.currentProjectId);
  });
  headerRow.appendChild(uploadBtn);
  sec.appendChild(headerRow);

  const dropzone = el('label', {
    class: 'block border-2 border-dashed border-white/[.15] hover:border-cyan-400/50 hover:bg-cyan-400/[.04] rounded-2xl p-5 text-center transition cursor-pointer group',
  }) as HTMLLabelElement;

  const fileInput = el('input', {
    type: 'file', multiple: true, class: 'hidden',
  }) as HTMLInputElement;
  fileInput.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    const files = Array.from(target.files ?? []);
    if (files.length && ProjectState.currentProjectId) {
      void handleProjectFileUploads(files, ProjectState.currentProjectId);
    }
    target.value = '';
  });
  dropzone.appendChild(fileInput);

  const dzIcon = el('div', { class: 'w-10 h-10 rounded-full bg-white/5 group-hover:bg-cyan-500/15 mx-auto flex items-center justify-center mb-2 transition' });
  dzIcon.appendChild(el('i', { class: 'fa-solid fa-cloud-arrow-up text-base text-slate-400 group-hover:text-cyan-400 transition' }));
  dropzone.append(
    dzIcon,
    el('p', { class: 'text-sm text-white font-bold', text: 'Kéo thả hoặc bấm để upload' }),
    el('p', { class: 'text-[10px] text-slate-500 mt-1', text: 'Tự động tối ưu Ảnh (ImageKit) · Tài liệu (B2) · Video (Supabase)' }),
  );
  dropzone.addEventListener('click', (e) => {
    if (e.target !== fileInput) fileInput.click();
  });
  sec.appendChild(dropzone);

  if (ProjectState.files.length) {
    const list = el('div', { class: 'space-y-2' });
    ProjectState.files.forEach((f) => list.appendChild(buildProjectFileRow(f)));
    sec.appendChild(list);
  }

  box.appendChild(sec);
}

function buildProjectFileRow(f: ProjectFile): HTMLElement {
  const meta = fileIcon(f.name);
  const row = el('div', { class: 'flex items-center gap-3 p-3 rounded-xl bg-white/[.02] border border-white/[.05] hover:bg-white/[.04] transition' });

  const iconEl = el('div', { class: `w-10 h-10 rounded-xl ${meta.bg} ${meta.cls} flex items-center justify-center shrink-0` });
  iconEl.appendChild(el('i', { class: `fa-solid ${meta.icon}` }));
  row.appendChild(iconEl);

  const info = el('div', { class: 'flex-1 min-w-0' });
  const metaLine = el('p', { class: 'text-[10px] text-slate-500 truncate flex items-center gap-1.5 flex-wrap' });
  metaLine.appendChild(document.createTextNode(fmtBytes(f.size)));
  
  // Badge hiển thị nơi lưu trữ
  if (f.kind === 'image') metaLine.appendChild(el('span', { class: 'text-cyan-400 font-bold', text: '· ImageKit' }));
  else if (f.kind === 'document') metaLine.appendChild(el('span', { class: 'text-amber-400 font-bold', text: '· B2' }));
  else if (f.kind === 'video') metaLine.appendChild(el('span', { class: 'text-violet-400 font-bold', text: '· Supabase' }));

  metaLine.appendChild(document.createTextNode(`· ${new Date(f.created_at).toLocaleDateString('vi-VN')}`));

  info.append(
    el('p', { class: 'text-sm font-bold text-white truncate', text: f.name }),
    metaLine,
  );
  row.appendChild(info);

  const actions = el('div', { class: 'flex gap-1 shrink-0' });
  
  // Nút Tải về
  const dlBtn = el('button', {
    class: 'w-8 h-8 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition flex items-center justify-center',
    title: 'Tải về',
  }) as HTMLButtonElement;
  dlBtn.appendChild(el('i', { class: 'fa-solid fa-download text-xs' }));
  
  dlBtn.addEventListener('click', async () => {
    try {
      dlBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i>';
      const signedUrl = await getFileDownloadUrl(f);
      window.open(signedUrl, '_blank', 'noopener');
      dlBtn.innerHTML = '<i class="fa-solid fa-download text-xs"></i>';
    } catch {
      Toast.show('Lỗi khi lấy link tải file', { type: 'error' });
      dlBtn.innerHTML = '<i class="fa-solid fa-download text-xs"></i>';
    }
  });
  actions.appendChild(dlBtn);

  const delBtn = el('button', {
    class: 'w-8 h-8 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition flex items-center justify-center',
    title: 'Xóa',
  }) as HTMLButtonElement;
  delBtn.appendChild(el('i', { class: 'fa-solid fa-trash text-xs' }));
  delBtn.addEventListener('click', () => { void handleDeleteProjectFile(f.id); });
  actions.appendChild(delBtn);

  row.appendChild(actions);
  return row;
}

/* ─────────────────────────────────────────────
   TAB 4: REPORTS
   ───────────────────────────────────────────── */
function renderReportsTab(box: HTMLElement): void {
  const sec = el('div', { class: 'glass rounded-2xl p-5 space-y-4' });

  const headerRow = el('div', { class: 'flex items-center justify-between gap-3 flex-wrap' });
  const title = el('h3', { class: 'font-black text-white text-sm flex items-center gap-2' });
  title.append(
    el('i', { class: 'fa-solid fa-chart-line text-emerald-400' }),
    el('span', { text: 'Lịch sử báo cáo' }),
  );
  headerRow.appendChild(title);

  const newBtn = el('button', {
    class: 'px-3 py-1.5 rounded-lg bg-gradient-to-r from-pink-600 to-violet-600 text-white text-xs font-black shadow-neon-pink hover:opacity-95 transition flex items-center gap-1.5',
  }) as HTMLElement;
  newBtn.append(
    el('i', { class: 'fa-solid fa-plus text-[10px]' }),
    el('span', { text: 'Báo cáo tiến độ' }),
  );
  newBtn.addEventListener('click', () => openReportModal());
  headerRow.appendChild(newBtn);
  sec.appendChild(headerRow);

  if (!ProjectState.reports.length) {
    const empty = el('div', { class: 'text-center py-8' });
    empty.append(
      el('i', { class: 'fa-solid fa-chart-simple text-2xl text-slate-700 mb-2 block' }),
      el('p', { class: 'text-xs text-slate-500', text: 'Chưa có báo cáo nào.' }),
    );
    sec.appendChild(empty);
    box.appendChild(sec);
    return;
  }

  const list = el('div', { class: 'space-y-2' });
  ProjectState.reports.forEach((r) => {
    const phase = ProjectState.phases.find((p) => p.id === r.phase_id);
    const row = el('div', { class: 'p-3 rounded-xl bg-white/[.02] border border-white/[.05] space-y-2' });

    const headRow = el('div', { class: 'flex items-center justify-between gap-2 flex-wrap' });
    const left = el('div', { class: 'flex items-center gap-2' });
    left.append(el('span', { class: 'text-xs font-bold text-white', text: 'Thành viên' }));
    if (phase) {
      left.appendChild(el('span', {
        class: 'text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/30 font-bold',
        text: phase.name,
      }));
    }
    headRow.append(
      left,
      el('span', { class: 'text-[10px] text-slate-500', text: new Date(r.created_at).toLocaleString('vi-VN') }),
    );
    row.appendChild(headRow);

    if (r.progress_pct != null) {
      const bar = el('div', { class: 'flex items-center gap-2' });
      const track = el('div', { class: 'flex-1 h-1.5 bg-black/40 rounded-full overflow-hidden' });
      track.appendChild(el('div', {
        class: 'h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500',
        style: `width:${r.progress_pct}%`,
      }));
      bar.append(
        track,
        el('span', { class: 'text-xs font-black text-emerald-300 shrink-0', text: `${r.progress_pct}%` }),
      );
      row.appendChild(bar);
    }

    if (r.note) {
      row.appendChild(el('p', { class: 'text-[11px] text-slate-400 italic', text: `"${r.note}"` }));
    }

    list.appendChild(row);
  });
  sec.appendChild(list);
  box.appendChild(sec);
}

/* ─────────────────────────────────────────────
   MODAL: BÁO CÁO TIẾN ĐỘ
   ───────────────────────────────────────────── */
function openReportModal(): void {
  const projectId = ProjectState.currentProjectId;
  if (!projectId) return;

  const project = (S.snapshot() as AppStateLike).projects.find((p) => p.id === projectId);
  if (!project) return;

  const modalId = 'reportProgressModal';
  document.getElementById(modalId)?.remove();

  Modal.open(modalId, null, (content: HTMLElement) => {
    const head = el('div', { class: 'shrink-0 flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[.06]' });
    const titleEl = el('h2', { class: 'font-black text-white text-base flex items-center gap-2' });
    titleEl.append(
      el('i', { class: 'fa-solid fa-chart-line text-emerald-400' }),
      el('span', { text: `Báo cáo tiến độ: ${project.name}` }),
    );
    const closeBtn = el('button', {
      class: 'w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition',
      'data-action': 'close-modal',
      'data-modal-id': modalId,
    });
    closeBtn.appendChild(el('i', { class: 'fa-solid fa-xmark text-sm' }));
    head.append(titleEl, closeBtn);
    content.appendChild(head);

    const body = el('div', { class: 'flex-1 overflow-y-auto scrollbar px-6 py-5 space-y-4 min-h-0' });

    const info = el('div', { class: 'p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-xs text-slate-300 flex items-start gap-2.5' });
    info.append(
      el('i', { class: 'fa-solid fa-circle-info text-violet-400 text-sm mt-0.5 shrink-0' }),
      (() => {
        const d = el('div');
        d.append(
          el('p', { class: 'font-bold text-white', text: 'Báo cáo tiến độ dự án' }),
          el('p', { class: 'text-slate-400 mt-0.5', text: 'Ghi nhận tiến độ theo từng giai đoạn.' }),
        );
        return d;
      })(),
    );
    body.appendChild(info);

    const phaseBlock = el('div');
    phaseBlock.appendChild(el('label', {
      class: 'block text-[10px] font-black text-slate-400 mb-1.5 tracking-widest uppercase',
      text: 'Giai đoạn (tùy chọn)',
    }));
    const phaseSelect = el('select', {
      class: 'w-full bg-black/40 border border-white/[.08] rounded-xl px-3.5 py-3 text-sm text-white focus:outline-none focus:border-violet-500/50 transition cursor-pointer',
    }) as HTMLSelectElement;
    phaseSelect.appendChild(el('option', { value: '', text: '— Báo cáo chung (không gắn giai đoạn) —' }));
    ProjectState.phases.forEach((p, idx) => {
      const statusLabel = p.status === 'done' ? ' (Hoàn thành)' : p.status === 'doing' ? ' (Đang làm)' : '';
      phaseSelect.appendChild(el('option', {
        value: p.id,
        text: `#${idx + 1} · ${p.name}${statusLabel}`,
      }));
    });
    phaseBlock.appendChild(phaseSelect);
    body.appendChild(phaseBlock);

    const progressBlock = el('div');
    progressBlock.appendChild(el('label', {
      class: 'block text-[10px] font-black text-slate-400 mb-1.5 tracking-widest uppercase',
      text: 'Tiến độ dự án (%) *',
    }));

    const currentProgress = computeProjectProgress();
    const progressRow = el('div', { class: 'flex items-center gap-3' });

    const progressInput = el('input', {
      type: 'number', min: '0', max: '100', step: '5',
      class: 'w-24 bg-black/40 border border-white/[.08] rounded-xl px-3.5 py-3 text-base font-black text-emerald-300 focus:outline-none focus:border-emerald-500/50 transition text-center',
    }) as HTMLInputElement;
    progressInput.value = String(currentProgress);

    const progressBar = el('div', { class: 'flex-1 h-2 bg-black/40 rounded-full overflow-hidden' });
    const progressFill = el('div', {
      class: 'h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-200',
      style: `width:${currentProgress}%`,
    });
    progressBar.appendChild(progressFill);

    progressInput.addEventListener('input', () => {
      const v = Math.max(0, Math.min(100, parseInt(progressInput.value, 10) || 0));
      progressFill.style.width = `${v}%`;
    });

    progressRow.append(progressInput, el('span', { class: 'text-xs text-slate-500 font-bold', text: '%' }), progressBar);
    progressBlock.appendChild(progressRow);
    progressBlock.appendChild(el('p', {
      class: 'text-[10px] text-slate-500 mt-2',
      text: `Tiến độ hiện tại (tự động từ phases): ${currentProgress}%`,
    }));
    body.appendChild(progressBlock);

    if (ProjectState.phases.length > 0) {
      const quickBlock = el('div', { class: 'p-3 rounded-xl bg-amber-500/[.05] border border-amber-500/20 space-y-2' });
      quickBlock.appendChild(el('div', {
        class: 'text-[10px] font-black text-amber-300 tracking-widest uppercase',
        text: '⚡ Cập nhật giai đoạn nhanh',
      }));
      const chips = el('div', { class: 'flex flex-wrap gap-1.5' });
      ProjectState.phases.forEach((p, idx) => {
        const isDone = p.status === 'done';
        const chip = el('button', {
          class: `px-2.5 py-1 rounded-lg text-[10px] font-bold transition border ${
            isDone
              ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
              : 'bg-white/[.03] text-slate-400 border-white/[.06] hover:bg-white/[.06]'
          }`,
          title: p.name,
        }) as HTMLButtonElement;
        chip.textContent = `#${idx + 1} ${isDone ? '✓' : ''}`;
        chip.addEventListener('click', () => {
          void (async () => {
            const newStatus: PhaseStatus = isDone ? 'doing' : 'done';
            await updatePhaseStatus(p.id, newStatus);
            Modal.close(modalId);
            setTimeout(openReportModal, 200);
          })();
        });
        chips.appendChild(chip);
      });
      quickBlock.appendChild(chips);
      body.appendChild(quickBlock);
    }

    const noteBlock = el('div');
    noteBlock.appendChild(el('label', {
      class: 'block text-[10px] font-black text-slate-400 mb-1.5 tracking-widest uppercase',
      text: 'Ghi chú / Nhận xét',
    }));
    const noteTa = el('textarea', {
      rows: '3',
      class: 'w-full bg-black/40 border border-white/[.08] rounded-xl px-3.5 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50 transition resize-none',
    }) as HTMLTextAreaElement;
    noteTa.placeholder = 'Mô tả những gì đã làm, khó khăn gặp phải, kế hoạch tiếp theo...';
    noteBlock.appendChild(noteTa);
    body.appendChild(noteBlock);

    content.appendChild(body);

    const footer = el('div', { class: 'shrink-0 px-6 py-4 border-t border-white/[.06] bg-black/20 flex justify-end gap-2' });
    const cancelBtn = el('button', {
      class: 'px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-bold text-slate-300 transition',
      'data-action': 'close-modal',
      'data-modal-id': modalId,
      text: 'Hủy',
    });
    const submitBtn = el('button', {
      class: 'px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:opacity-95 text-sm font-black text-white transition shadow-lg active:scale-[0.98]',
      text: 'Gửi báo cáo',
    }) as HTMLButtonElement;

    submitBtn.addEventListener('click', () => {
      void (async () => {
        const phaseId = phaseSelect.value || null;
        const progressPct = parseInt(progressInput.value, 10) || 0;
        const note = noteTa.value.trim();

        if (progressPct < 0 || progressPct > 100) {
          Toast.show('Tiến độ phải từ 0-100%', { type: 'error' });
          return;
        }
        if (!note || note.length < 5) {
          Toast.show('Vui lòng nhập ghi chú ít nhất 5 ký tự', { type: 'error' });
          noteTa.focus();
          return;
        }

        const orig = submitBtn.textContent ?? 'Gửi báo cáo';
        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang gửi...';

        try {
          const saved = await createReport({
            projectId,
            phaseId,
            progressPct,
            note,
            reportType: 'phase',
          });
          ProjectState.reports.unshift(saved);
          Modal.close(modalId);
          Toast.show('✅ Đã gửi báo cáo tiến độ', { type: 'success' });
          renderProjectDetail();
        } catch (err) {
          console.error('Submit report failed:', err);
          Toast.show(`Lỗi: ${err instanceof Error ? err.message : 'không rõ'}`, { type: 'error' });
          submitBtn.disabled = false;
          submitBtn.textContent = orig;
        }
      })();
    });

    footer.append(cancelBtn, submitBtn);
    content.appendChild(footer);
  });
}

/* ─────────────────────────────────────────────
   FILE UPLOAD → PROJECT
   ───────────────────────────────────────────── */
const MAX_FILE_SIZE = 100 * 1024 * 1024;

function openProjectFileUpload(projectId: string): void {
  if (!projectId) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = '*/*';
  input.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    const files = Array.from(target.files ?? []);
    if (files.length) void handleProjectFileUploads(files, projectId);
  });
  input.click();
}

async function handleProjectFileUploads(files: File[], projectId: string): Promise<void> {
  if (!projectId) return;

  const valid = files.filter((f) => f.size <= MAX_FILE_SIZE);
  const skipped = files.length - valid.length;
  if (skipped > 0) Toast.show(`${skipped} file vượt 100MB đã bị bỏ qua.`, { type: 'warn' });
  if (!valid.length) return;

  ensureUploadPanelVisible();

  let success = 0;
  for (const file of valid) {
    const ok = await processOneProjectFile(file, projectId);
    if (ok) success++;
  }

  if (success > 0) {
    Toast.show(`Đã upload ${success} file vào dự án`, { type: 'success' });
    try {
      ProjectState.files = await reloadProjectFiles(projectId);
      renderProjectDetail();
    } catch (err) {
      console.error('Reload project files failed:', err);
    }
  }
}

async function processOneProjectFile(file: File, projectId: string): Promise<boolean> {
  const meta = fileIcon(file.name);
  const panel = document.getElementById('uploadPanel');
  if (!panel) return false;

  const row = el('div', { class: 'upload-row' });
  const top = el('div', { class: 'flex items-center gap-3' });
  const iconBox = el('div', { class: `w-9 h-9 rounded-xl ${meta.bg} ${meta.cls} flex items-center justify-center shrink-0` });
  iconBox.appendChild(el('i', { class: `fa-solid ${meta.icon} text-sm` }));
  const info = el('div', { class: 'flex-1 min-w-0' });
  const nameEl = el('div', { class: 'text-sm font-bold text-white truncate', text: file.name });
  const statusEl = el('div', { class: 'text-[11px] text-slate-400 font-semibold', text: 'Đang xử lý…' });
  info.append(nameEl, statusEl);
  const pctEl = el('div', { class: 'text-sm font-black text-cyan-300 tabular-nums', text: '0%' });
  top.append(iconBox, info, pctEl);

  const barTrack = el('div', { class: 'upload-bar-track' });
  const barFill = el('div', { class: 'upload-bar-fill', style: 'width:0%' });
  barTrack.appendChild(barFill);
  row.append(top, barTrack);
  panel.appendChild(row);

  const setPct = (v: number): void => {
    const val = Math.max(0, Math.min(100, v));
    barFill.style.width = `${val}%`;
    pctEl.textContent = `${Math.round(val)}%`;
  };

  try {
    statusEl.textContent = 'Đang upload...';
    setPct(40);

    const result = await uploadFile(file, projectId, 'project');
    setPct(80);

    statusEl.textContent = 'Lưu metadata…';
    const saved = await saveFileMetadata(file, result, projectId, 'project');
    ProjectState.files.unshift(saved as unknown as ProjectFile);
    
    setPct(100);
    statusEl.textContent = 'Đã lưu thành công';
    statusEl.className = 'text-[11px] text-emerald-300 font-bold';

    setTimeout(() => {
      row.style.transition = 'opacity .3s, transform .3s';
      row.style.opacity = '0';
      row.style.transform = 'translateX(30px)';
      setTimeout(() => { row.remove(); maybeHidePanel(); }, 300);
    }, 900);

    return true;
  } catch (err) {
    console.error('Upload file to project failed:', err);
    statusEl.textContent = `Lỗi: ${err instanceof Error ? err.message : 'không rõ'}`;
    statusEl.className = 'text-[11px] text-rose-300 font-bold';
    pctEl.textContent = '✕';
    pctEl.className = 'text-lg font-black text-rose-400';
    setTimeout(() => { row.remove(); maybeHidePanel(); }, 3000);
    Toast.show(
      `❌ Lỗi upload "${file.name}": ${err instanceof Error ? err.message : 'không rõ'}`,
      { type: 'error', timeout: 5000 },
    );
    return false;
  }
}

async function handleDeleteProjectFile(fileId: string): Promise<void> {
  const file = ProjectState.files.find((f) => f.id === fileId);
  if (!file) return;
  if (!confirm(`Xóa file "${file.name}"?\n\nKhông thể hoàn tác!`)) return;

  try {
    if (file.storage_path) {
      const removed=await deleteFileFromStorage(file.storage_path, file.kind, file.id);
      if(!removed)throw new Error('Chưa xóa được tệp trong kho; giữ nguyên thông tin');
    }
    await deleteProjectFileMeta(fileId);
    ProjectState.files = ProjectState.files.filter((f) => f.id !== fileId);
    Toast.show(`Đã xóa "${file.name}"`, { type: 'success' });
    renderProjectDetail();
  } catch (err) {
    console.error('Delete project file failed:', err);
    Toast.show(`Lỗi xóa file: ${err instanceof Error ? err.message : 'không rõ'}`, { type: 'error' });
  }
}
