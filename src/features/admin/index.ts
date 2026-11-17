import { Auth } from '../../core/auth';
import { Toast } from '../../ui/toast';
import { escHtml } from '../../utils';
import type { Profile, Role } from '../../core/types';
import type { ClubPosition } from '../../core/access';
import {
  approveUser,
  changeRole,
  changeClubPosition,
  countPendingUsers,
  deleteUserProfile,
  loadAllProfiles,
  rejectUser,
} from './service';

const state = {
  users: [] as Profile[],
  filter: 'all' as 'all' | 'pending' | 'active' | 'rejected',
  loading: false,
  initialized: false,
};

function isAdmin(): boolean {
  return Boolean(Auth.isSuperAdmin || Auth.isClubAdmin);
}

function isSuperAdmin(): boolean {
  return Boolean(Auth.isSuperAdmin);
}

function injectAdminDOM(): void {
  const existing = document.getElementById('adminSection');
  if (existing?.dataset.fpcAdmin === '1') return;

  const anchor = document.getElementById('departmentsSection') || document.getElementById('projectsSection');
  if (!anchor && !existing) return;

  const sec = existing || document.createElement('section');
  sec.id = 'adminSection';
  sec.className = 'hidden space-y-4';
  sec.dataset.fpcAdmin = '1';
  sec.innerHTML = `
    <div class="glass rounded-2xl overflow-hidden">
      <div class="p-5 border-b border-white/[.06] flex justify-between items-center gap-3 flex-wrap">
        <div>
          <h2 class="text-lg font-black text-white flex items-center gap-2">
            <i class="fa-solid fa-shield-halved text-amber-400"></i> Quản trị thành viên
          </h2>
          <p class="text-xs text-slate-500 mt-0.5">Duyệt tài khoản, phân quyền, quản lý thành viên CLB</p>
        </div>
      </div>
      <div class="px-5 py-3 grid grid-cols-3 gap-3 border-b border-white/[.06]">
        <div class="text-center"><div class="text-2xl font-black text-amber-400" id="statPending">0</div><div class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Chờ duyệt</div></div>
        <div class="text-center"><div class="text-2xl font-black text-emerald-400" id="statActive">0</div><div class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Hoạt động</div></div>
        <div class="text-center"><div class="text-2xl font-black text-rose-400" id="statRejected">0</div><div class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Từ chối</div></div>
      </div>
      <div class="px-5 py-3 border-b border-white/[.06] flex flex-wrap gap-2" id="adminFilters"></div>
      <div id="adminUserList" class="divide-y divide-white/[.04]"></div>
      <div id="adminEmpty" class="hidden text-center py-12 px-6"><p class="text-slate-400 font-bold text-sm">Không có user nào</p></div>
    </div>
  `;
  if (!sec.parentNode && anchor?.parentNode) anchor.parentNode.insertBefore(sec, anchor.nextSibling);
}

function renderFilters(): void {
  const el = document.getElementById('adminFilters');
  if (!el) return;
  el.replaceChildren();
  const chips: { key: typeof state.filter; label: string; count: number }[] = [
    { key: 'all', label: 'Tất cả', count: state.users.length },
    { key: 'pending', label: 'Chờ duyệt', count: state.users.filter((u) => u.approval_status === 'pending').length },
    { key: 'active', label: 'Hoạt động', count: state.users.filter((u) => u.approval_status === 'active').length },
    { key: 'rejected', label: 'Từ chối', count: state.users.filter((u) => u.approval_status === 'rejected').length },
  ];
  for (const c of chips) {
    const active = state.filter === c.key;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `px-3 py-1.5 rounded-lg text-[11px] font-black transition flex items-center gap-1.5 border ${active ? 'bg-amber-500/20 text-amber-200 border-amber-500/40' : 'bg-white/[.03] text-slate-400 border-white/[.06] hover:bg-white/[.06]'}`;
    btn.innerHTML = `<span>${c.label}</span><span class="opacity-60">${c.count}</span>`;
    btn.addEventListener('click', () => { state.filter = c.key; render(); });
    el.appendChild(btn);
  }
}

function render(): void {
  renderFilters();
  const list = document.getElementById('adminUserList');
  const empty = document.getElementById('adminEmpty');
  if (!list || !empty) return;

  document.getElementById('statPending')!.textContent = String(state.users.filter((u) => u.approval_status === 'pending').length);
  document.getElementById('statActive')!.textContent = String(state.users.filter((u) => u.approval_status === 'active').length);
  document.getElementById('statRejected')!.textContent = String(state.users.filter((u) => u.approval_status === 'rejected').length);

  list.replaceChildren();
  if (state.loading) {
    for (let i = 0; i < 3; i++) {
      const s = document.createElement('div');
      s.className = 'h-20 skel';
      list.appendChild(s);
    }
    empty.classList.add('hidden');
    return;
  }

  const filtered = state.filter === 'all' ? state.users : state.users.filter((u) => u.approval_status === state.filter);
  if (!filtered.length) {
    list.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }
  list.classList.remove('hidden');
  empty.classList.add('hidden');

  for (const u of filtered) list.appendChild(buildRow(u));
}

function buildRow(u: Profile): HTMLElement {
  const myId = Auth.user?.id;
  const isMe = u.id === myId;
  const initial = (u.display_name || 'U')[0]!.toUpperCase();
  const row = document.createElement('div');
  row.className = 'flex items-center gap-3 px-5 py-3 hover:bg-white/[.02] transition flex-wrap';

  const statusClass = u.approval_status === 'pending' ? 'bg-amber-500/15 text-amber-300'
    : u.approval_status === 'active' ? 'bg-emerald-500/15 text-emerald-300'
    : 'bg-rose-500/15 text-rose-300';
  const statusLabel = u.approval_status === 'pending' ? 'Chờ duyệt'
    : u.approval_status === 'active' ? 'Hoạt động'
    : 'Từ chối';

  row.innerHTML = `
    <div class="w-11 h-11 rounded-xl flex items-center justify-center font-black text-white text-sm shrink-0" style="background:linear-gradient(135deg,#8b5cf6,#ec4899)">${escHtml(initial)}</div>
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="font-bold text-white text-sm truncate">${escHtml(u.display_name)}${isMe ? ' <span class="text-[9px] px-1.5 py-0.5 rounded bg-pink-500/15 text-pink-300 border border-pink-500/30">BẠN</span>' : ''}</span>
        <span class="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 font-black uppercase">${escHtml(u.role)}</span>
        <span class="text-[10px] px-1.5 py-0.5 rounded ${statusClass} font-black">${statusLabel}</span>
      </div>
      <div class="text-[11px] text-slate-500 truncate mt-1">${escHtml(u.email)}</div>
    </div>
    <div class="flex gap-1.5 shrink-0 flex-wrap justify-end" data-actions></div>
  `;

  const actions = row.querySelector('[data-actions]')!;

  if (u.approval_status === 'pending') {
    actions.appendChild(makeBtn('Duyệt', 'emerald', () => void handleApprove(u)));
    actions.appendChild(makeBtn('Từ chối', 'rose', () => void handleReject(u)));
  }

  if (isSuperAdmin() && !isMe) {
    const sel = document.createElement('select');
    sel.className = 'bg-black/40 border border-white/[.08] rounded-lg px-2 py-1.5 text-[11px] font-bold text-white';
    for (const r of ['member', 'admin', 'viewer'] as Role[]) {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = r;
      if (u.role === r) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => {
      void changeRole(u.id, sel.value as Role)
        .then(() => { Toast.show('Đã đổi quyền', { type: 'success' }); return refresh(); })
        .catch((e: unknown) => Toast.show('Lỗi: ' + (e instanceof Error ? e.message : ''), { type: 'error' }));
    });
    actions.appendChild(sel);
  }

  if (isAdmin() && !isMe && (u.role !== 'super_admin' || isSuperAdmin()) && u.approval_status === 'active') {
    const position = document.createElement('select');
    position.setAttribute('aria-label', `Chức vụ CLB của ${u.display_name}`);
    position.className = 'club-position-select';
    for (const [value, label] of [['', 'Thành viên CLB'], ['president', 'Trưởng CLB'], ['vice_president', 'Phó CLB']]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = value === (u.club_position ?? '');
      position.append(option);
    }
    position.onchange = async () => {
      if (!window.confirm(`Đổi chức vụ CLB của ${u.display_name}?`)) { position.value = u.club_position ?? ''; return; }
      position.disabled = true;
      try {
        await changeClubPosition(u.id, (position.value || null) as ClubPosition);
        await refresh();
      } catch (error) {
        position.value = u.club_position ?? '';
        Toast.show(error instanceof Error ? error.message : 'Không đổi được chức vụ', { type: 'error' });
      } finally { position.disabled = false; }
    };
    actions.append(position);
  }

  if (isSuperAdmin() && !isMe && u.role !== 'super_admin') {
    actions.appendChild(makeBtn('Xóa', 'rose', () => void handleDelete(u)));
  }

  return row;
}

function makeBtn(label: string, tone: 'emerald' | 'rose', onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className =
    tone === 'emerald'
      ? 'px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition'
      : 'px-3 py-1.5 rounded-lg text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 transition';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

async function handleApprove(u: Profile): Promise<void> {
  if (!window.confirm(`Duyệt tài khoản "${u.display_name}"?`)) return;
  try {
    await approveUser(u.id, Auth.user?.id ?? '');
    Toast.show(`Đã duyệt "${u.display_name}"`, { type: 'success' });
    await refresh();
  } catch (err) {
    Toast.show('Lỗi: ' + (err instanceof Error ? err.message : ''), { type: 'error' });
  }
}

async function handleReject(u: Profile): Promise<void> {
  if (!window.confirm(`Từ chối "${u.display_name}"?`)) return;
  try {
    await rejectUser(u.id, Auth.user?.id ?? '');
    Toast.show(`Đã từ chối "${u.display_name}"`, { type: 'warn' });
    await refresh();
  } catch (err) {
    Toast.show('Lỗi: ' + (err instanceof Error ? err.message : ''), { type: 'error' });
  }
}

async function handleDelete(u: Profile): Promise<void> {
  if (!window.confirm(`Xóa vĩnh viễn "${u.display_name}"?`)) return;
  try {
    await deleteUserProfile(u.id);
    Toast.show('Đã xóa', { type: 'success' });
    await refresh();
  } catch (err) {
    Toast.show('Lỗi: ' + (err instanceof Error ? err.message : ''), { type: 'error' });
  }
}

async function refresh(): Promise<void> {
  state.loading = true;
  render();
  try {
    state.users = await loadAllProfiles();
  } catch (err) {
    Toast.show('Không tải được danh sách user', { type: 'error' });
  } finally {
    state.loading = false;
    render();
    void updatePendingBadge();
  }
}

export async function updatePendingBadge(): Promise<void> {
  const badge = document.getElementById('adminPendingBadge');
  if (!badge) return;
  const n = await countPendingUsers();
  if (n > 0) {
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

export async function initAdminFeature(): Promise<void> {
  if (!isAdmin()) return;
  if (state.initialized) {
    await refresh();
    return;
  }
  injectAdminDOM();
  state.initialized = true;
  await refresh();
}

export function destroyAdminFeature(): void {
  state.initialized = false;
  state.users = [];
  state.filter = 'all';
}
