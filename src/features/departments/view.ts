import { escHtml } from '../../utils';
import type { DeptData, DeptMemberInfo, DeptWithHead } from './service';

const DEPT_COLORS: Record<string, { grad: string; badge: string }> = {
  pink: { grad: 'from-pink-500 to-rose-500', badge: 'bg-pink-500/10 text-pink-300 border-pink-500/30' },
  cyan: { grad: 'from-cyan-500 to-blue-500', badge: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' },
  violet: { grad: 'from-violet-500 to-purple-500', badge: 'bg-violet-500/10 text-violet-300 border-violet-500/30' },
  amber: { grad: 'from-amber-500 to-orange-500', badge: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  emerald: { grad: 'from-emerald-500 to-teal-500', badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
};

export interface DeptViewHandlers {
  onOpenDetail: (deptId: string) => void;
  onCreate: () => void;
  onFilterChange: (key: string) => void;
  onSearch: (q: string) => void;
}

export function injectDepartmentsDOM(): void {
  const existing = document.getElementById('departmentsSection');
  if (existing && existing.children.length > 0) return;

  const anchor = document.getElementById('projectsSection') || document.getElementById('adminSection');
  if (!anchor) return;

  const sec = existing || document.createElement('section');
  sec.id = 'departmentsSection';
  sec.className = 'hidden space-y-5';
  sec.innerHTML = `
    <div class="glass rounded-2xl overflow-hidden">
      <div class="p-5 border-b border-white/[.06] flex justify-between items-center gap-3 flex-wrap">
        <div>
          <h2 class="text-lg font-black text-white flex items-center gap-2">
            <i class="fa-solid fa-building-user text-violet-400"></i> Danh sách Ban
          </h2>
          <p class="text-xs text-slate-500 mt-0.5">Tổ chức CLB theo ban — phân công trưởng ban và thành viên</p>
        </div>
        <button id="btnCreateDept" class="hidden px-4 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-violet-600 text-white text-xs font-black shadow-neon-pink hover:opacity-95 transition flex items-center gap-2">
          <i class="fa-solid fa-plus text-[11px]"></i><span>Tạo ban mới</span>
        </button>
      </div>
      <div id="deptList" class="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
      <div id="deptEmpty" class="hidden text-center py-16 px-6">
        <div class="w-16 h-16 rounded-2xl bg-white/[.03] mx-auto mb-4 flex items-center justify-center">
          <i class="fa-solid fa-building text-2xl text-slate-700"></i>
        </div>
        <p class="text-slate-400 font-bold text-sm">Chưa có ban nào</p>
      </div>
    </div>
    <div class="glass rounded-2xl overflow-hidden">
      <div class="p-5 border-b border-white/[.06]">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 class="text-lg font-black text-white flex items-center gap-2">
              <i class="fa-solid fa-users text-cyan-400"></i> Thành viên CLB
            </h2>
            <p class="text-xs text-slate-500 mt-0.5"><span id="deptMemberCount">0</span> thành viên đang hoạt động</p>
          </div>
          <div class="relative w-full sm:w-64">
            <i class="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs pointer-events-none"></i>
            <input id="deptMemberSearch" type="text" placeholder="Tìm thành viên..." class="w-full bg-black/30 border border-white/[.08] rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition">
          </div>
        </div>
        <div id="deptMemberFilters" class="flex flex-wrap gap-2 mt-3"></div>
      </div>
      <div id="deptMemberList" class="divide-y divide-white/[.04]"></div>
      <div id="deptMemberEmpty" class="hidden text-center py-12 px-6">
        <i class="fa-solid fa-users-slash text-3xl text-slate-700 mb-3 block"></i>
        <p class="text-slate-400 font-bold text-sm">Không có thành viên nào</p>
      </div>
    </div>
  `;
  if (!existing) {
    anchor.parentNode?.insertBefore(sec, anchor.nextSibling);
  }
}

export function renderDepartments(
  data: DeptData,
  loading: boolean,
  isAdmin: boolean,
  handlers: DeptViewHandlers,
): void {
  const listEl = document.getElementById('deptList');
  const emptyEl = document.getElementById('deptEmpty');
  const btn = document.getElementById('btnCreateDept') as HTMLButtonElement | null;
  if (!listEl) return;

  if (btn) {
    btn.classList.toggle('hidden', !isAdmin);
    btn.onclick = handlers.onCreate;
  }

  listEl.replaceChildren();

  if (loading) {
    for (let i = 0; i < 3; i++) {
      const skel = document.createElement('div');
      skel.className = 'h-40 rounded-2xl skel';
      listEl.appendChild(skel);
    }
    emptyEl?.classList.add('hidden');
    return;
  }

  if (!data.departments.length) {
    emptyEl?.classList.remove('hidden');
    listEl.classList.add('hidden');
    return;
  }

  emptyEl?.classList.add('hidden');
  listEl.classList.remove('hidden');

  for (const d of data.departments) {
    listEl.appendChild(buildDeptCard(d, data.members[d.id] ?? [], isAdmin, handlers));
  }
}

function buildDeptCard(
  d: DeptWithHead,
  members: DeptMemberInfo[],
  isAdmin: boolean,
  handlers: DeptViewHandlers,
): HTMLElement {
  const c = DEPT_COLORS[d.color] ?? DEPT_COLORS.violet!;
  const card = document.createElement('article');
  card.className = 'glass-card rounded-2xl p-4 flex flex-col cursor-pointer hover:border-violet-500/30 transition group';

  const head = document.createElement('div');
  head.className = 'flex items-start justify-between gap-2 mb-3';
  const iconBox = document.createElement('div');
  iconBox.className = `w-11 h-11 rounded-xl bg-gradient-to-br ${c.grad} flex items-center justify-center shrink-0 shadow-lg`;
  iconBox.innerHTML = `<i class="fa-solid ${escHtml(d.icon || 'fa-users')} text-white text-sm"></i>`;
  head.appendChild(iconBox);
  if (isAdmin) {
    const menu = document.createElement('button');
    menu.className = 'w-7 h-7 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition flex items-center justify-center opacity-0 group-hover:opacity-100';
    menu.innerHTML = '<i class="fa-solid fa-ellipsis-vertical text-xs"></i>';
    menu.addEventListener('click', (e) => e.stopPropagation());
    head.appendChild(menu);
  }

  const title = document.createElement('h3');
  title.className = 'font-black text-white text-base leading-tight mb-1';
  title.textContent = d.name;

  const desc = document.createElement('p');
  desc.className = 'text-xs text-slate-500 mb-3 line-clamp-2 min-h-[32px]';
  desc.textContent = d.description || 'Chưa có mô tả';

  const headRow = document.createElement('div');
  headRow.className = 'flex items-center gap-2 mb-3 py-2 px-2.5 rounded-xl bg-white/[.02] border border-white/[.05]';
  if (d.head) {
    const initial = (d.head.display_name || 'U')[0]!.toUpperCase();
    headRow.innerHTML = `
      <div class="w-7 h-7 rounded-lg bg-gradient-to-br ${c.grad} flex items-center justify-center font-black text-white text-[10px] shrink-0">${escHtml(initial)}</div>
      <div class="flex-1 min-w-0">
        <div class="text-[10px] text-slate-500 font-bold tracking-widest uppercase">Trưởng ban</div>
        <div class="text-xs font-bold text-white truncate">${escHtml(d.head.display_name)}</div>
      </div>
    `;
  } else {
    headRow.innerHTML = '<i class="fa-solid fa-user-slash text-slate-600 text-xs"></i><span class="text-xs text-slate-500 italic">Chưa có trưởng ban</span>';
  }

  const stats = document.createElement('div');
  stats.className = 'flex items-center gap-3 mb-3 text-[11px] text-slate-400';
  stats.innerHTML = `<span class="flex items-center gap-1"><i class="fa-solid fa-users text-[10px]"></i><span class="font-bold text-white">${members.length}</span> thành viên</span>`;

  const foot = document.createElement('div');
  foot.className = 'mt-auto pt-3 border-t border-white/[.06] flex justify-between items-center';
  foot.innerHTML = '<span class="text-xs font-bold text-violet-300 flex items-center gap-1.5"><i class="fa-solid fa-arrow-right text-[10px]"></i>Xem chi tiết</span>';

  card.append(head, title, desc, headRow, stats, foot);
  card.addEventListener('click', () => handlers.onOpenDetail(d.id));
  return card;
}

export function renderDeptMembers(
  data: DeptData,
  filter: string,
  search: string,
  handlers: DeptViewHandlers,
): void {
  const listEl = document.getElementById('deptMemberList');
  const emptyEl = document.getElementById('deptMemberEmpty');
  const countEl = document.getElementById('deptMemberCount');
  const filtersEl = document.getElementById('deptMemberFilters');
  const searchInput = document.getElementById('deptMemberSearch') as HTMLInputElement | null;
  if (!listEl) return;

  if (searchInput && searchInput.value !== search) {
    searchInput.oninput = (e): void => handlers.onSearch((e.target as HTMLInputElement).value);
  }

  const activeUsers = data.users.filter((u) => u.approval_status === 'active');
  if (countEl) countEl.textContent = String(activeUsers.length);

  if (filtersEl) {
    filtersEl.replaceChildren();
    const noDeptCount = activeUsers.filter(
      (u) => !Object.values(data.members).some((arr) => arr.some((m) => m.id === u.id)),
    ).length;
    const chips: { key: string; label: string; count: number; icon?: string }[] = [
      { key: 'all', label: 'Tất cả', count: activeUsers.length, icon: 'fa-layer-group' },
      ...data.departments.map((d) => ({
        key: d.id,
        label: d.name,
        count: (data.members[d.id] ?? []).length,
      })),
      { key: 'no_dept', label: 'Chưa vào ban', count: noDeptCount, icon: 'fa-user-slash' },
    ];

    for (const c of chips) {
      const active = filter === c.key;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `px-3 py-1.5 rounded-lg text-[11px] font-black transition flex items-center gap-1.5 border ${
        active ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40' : 'bg-white/[.03] text-slate-400 border-white/[.06] hover:bg-white/[.06]'
      }`;
      chip.innerHTML = `${c.icon ? `<i class="fa-solid ${c.icon} text-[10px]"></i>` : ''}<span>${escHtml(c.label)}</span><span class="opacity-60">${c.count}</span>`;
      chip.addEventListener('click', () => handlers.onFilterChange(c.key));
      filtersEl.appendChild(chip);
    }
  }

  let visible: DeptMemberInfo[] = [];
  if (filter === 'all') {
    visible = activeUsers.map((u) => ({ ...u, deptRole: 'member', joinedAt: '' }));
  } else if (filter === 'no_dept') {
    visible = activeUsers
      .filter((u) => !Object.values(data.members).some((arr) => arr.some((m) => m.id === u.id)))
      .map((u) => ({ ...u, deptRole: 'member', joinedAt: '' }));
  } else {
    visible = data.members[filter] ?? [];
  }

  const q = search.toLowerCase().trim();
  if (q) {
    visible = visible.filter(
      (u) => u.display_name.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q),
    );
  }

  listEl.replaceChildren();
  if (!visible.length) {
    listEl.classList.add('hidden');
    emptyEl?.classList.remove('hidden');
    return;
  }
  emptyEl?.classList.add('hidden');
  listEl.classList.remove('hidden');

  for (const u of visible) {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-3 px-5 py-3 hover:bg-white/[.02] transition';
    const initial = (u.display_name || 'U')[0]!.toUpperCase();
    row.innerHTML = `
      <div class="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 to-violet-500 flex items-center justify-center font-black text-white text-xs shrink-0">${escHtml(initial)}</div>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-bold text-white truncate">${escHtml(u.display_name)}</div>
        <div class="text-xs text-slate-500 truncate">${escHtml(u.email)}</div>
      </div>
      <span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-400 font-black uppercase">${escHtml(u.role)}</span>
    `;
    listEl.appendChild(row);
  }
}
