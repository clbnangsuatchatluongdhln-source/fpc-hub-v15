import { Auth } from '../../core/auth';
import { Modal } from '../../ui/modal';
import { Toast } from '../../ui/toast';
import { escHtml } from '../../utils';
import {
  addDeptMember,
  createDepartment,
  deleteDepartment,
  loadDeptData,
  removeDeptMember,
  setDeptHead,
  type DeptData,
} from './service';
import { injectDepartmentsDOM, renderDepartments, renderDeptMembers, type DeptViewHandlers } from './view';

const state = {
  data: { departments: [], members: {}, users: [] } as DeptData,
  loading: false,
  filter: 'all',
  search: '',
  initialized: false,
};

function isAdmin(): boolean {
  return Boolean(Auth.isSuperAdmin || Auth.isClubAdmin);
}

async function refresh(): Promise<void> {
  state.loading = true;
  render();
  try {
    state.data = await loadDeptData();
  } catch (err) {
    Toast.show('Không tải được dữ liệu tổ chức: ' + (err instanceof Error ? err.message : ''), { type: 'error' });
  } finally {
    state.loading = false;
    render();
  }
}

function render(): void {
  const handlers: DeptViewHandlers = {
    onOpenDetail: (id) => openDetail(id),
    onCreate: () => void handleCreate(),
    onFilterChange: (key) => { state.filter = key; render(); },
    onSearch: (q) => { state.search = q; render(); },
  };
  renderDepartments(state.data, state.loading, isAdmin(), handlers);
  renderDeptMembers(state.data, state.filter, state.search, handlers);
}

async function handleCreate(): Promise<void> {
  const name = window.prompt('Tên ban mới:');
  if (!name?.trim()) return;
  try {
    await createDepartment({ name: name.trim(), description: null, color: 'violet', icon: 'fa-users', head_id: null });
    Toast.show('Đã tạo ban', { type: 'success' });
    await refresh();
  } catch (err) {
    Toast.show('Lỗi tạo ban: ' + (err instanceof Error ? err.message : ''), { type: 'error' });
  }
}

function openDetail(deptId: string): void {
  if (!isAdmin()) return;
  const dept = state.data.departments.find((d) => d.id === deptId);
  if (!dept) return;
  const members = state.data.members[deptId] ?? [];
  const memberIds = new Set(members.map((m) => m.id));
  const available = state.data.users.filter((u) => u.approval_status === 'active' && !memberIds.has(u.id));

  Modal.open(`deptDetail-${deptId}`, null, (content) => {
    content.innerHTML = `
      <div class="p-6 border-b border-white/[.06] flex items-start justify-between gap-3">
        <div>
          <h2 class="text-lg font-black text-white">${escHtml(dept.name)}</h2>
          <p class="text-xs text-slate-500 mt-1">${escHtml(dept.description || 'Chưa có mô tả')}</p>
        </div>
        <button class="w-8 h-8 rounded-lg hover:bg-white/10 text-slate-400 flex items-center justify-center" data-close>
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="p-6 space-y-4 overflow-y-auto scrollbar" style="max-height:60vh">
        <div>
          <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Trưởng ban</h3>
          <select data-head class="w-full bg-black/40 border border-white/[.08] rounded-xl px-3 py-2 text-sm text-white">
            <option value="">— Chưa có —</option>
            ${members.map((m) => `<option value="${m.id}" ${dept.head_id === m.id ? 'selected' : ''}>${escHtml(m.display_name)}</option>`).join('')}
          </select>
        </div>
        <div>
          <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Thành viên (${members.length})</h3>
          <div class="space-y-2">
            ${members.length === 0 ? '<p class="text-xs text-slate-500 italic">Chưa có thành viên</p>' : members.map((m) => `
              <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[.02] border border-white/[.05]">
                <span class="text-sm font-bold text-white flex-1 truncate">${escHtml(m.display_name)}</span>
                <button class="w-7 h-7 rounded-lg hover:bg-rose-500/20 text-rose-400" data-remove="${m.id}"><i class="fa-solid fa-xmark text-xs"></i></button>
              </div>
            `).join('')}
          </div>
        </div>
        <div>
          <h3 class="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Thêm thành viên</h3>
          <div class="flex gap-2">
            <select data-add class="flex-1 bg-black/40 border border-white/[.08] rounded-xl px-3 py-2 text-sm text-white">
              <option value="">— Chọn user —</option>
              ${available.map((u) => `<option value="${u.id}">${escHtml(u.display_name)} (${escHtml(u.email)})</option>`).join('')}
            </select>
            <button data-add-btn class="px-4 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-violet-600 text-white text-xs font-black">Thêm</button>
          </div>
        </div>
        <button data-delete class="w-full py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-black">Xóa ban này</button>
      </div>
    `;
    const root = content;
    root.querySelector('[data-close]')?.addEventListener('click', () => Modal.close(`deptDetail-${deptId}`));
    root.querySelector('[data-head]')?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value || null;
      void setDeptHead(deptId, val).then(() => refresh());
    });
    root.querySelectorAll<HTMLElement>('[data-remove]').forEach((el) => {
      el.addEventListener('click', () => {
        const uid = el.dataset.remove;
        if (uid) void removeDeptMember(deptId, uid).then(() => { Modal.close(`deptDetail-${deptId}`); void refresh(); });
      });
    });
    root.querySelector('[data-add-btn]')?.addEventListener('click', () => {
      const sel = root.querySelector('[data-add]') as HTMLSelectElement | null;
      const uid = sel?.value;
      if (!uid) return;
      void addDeptMember(deptId, uid, 'member').then(() => { Modal.close(`deptDetail-${deptId}`); void refresh(); });
    });
    root.querySelector('[data-delete]')?.addEventListener('click', () => {
      if (!window.confirm(`Xóa ban "${dept.name}"?`)) return;
      void deleteDepartment(deptId).then(() => { Modal.close(`deptDetail-${deptId}`); Toast.show('Đã xóa ban', { type: 'success' }); void refresh(); });
    });
  });
}

export async function initDepartmentsFeature(): Promise<void> {
  if (!isAdmin()) return;
  if (state.initialized) {
    await refresh();
    return;
  }
  injectDepartmentsDOM();
  state.initialized = true;
  await refresh();
}

export function destroyDepartmentsFeature(): void {
  state.initialized = false;
  state.data = { departments: [], members: {}, users: [] };
  state.filter = 'all';
  state.search = '';
}
