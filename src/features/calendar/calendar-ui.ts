// ============================================================
// FPC HUB v15 · Calendar Module — UI layer
// ============================================================

import { escHtml } from '../../utils';
import {
  CAL_COLORS,
  VI_DAYS_FULL,
  VI_DAYS_SHORT,
  VI_MONTHS,
  addDays,
  aggregateDuplicates,
  calculateOverlapLayouts,
  formatTime,
  getDeadlineInfo,
  getTimeRange,
  isToday,
  minutesFromMidnight,
  parseYmd,
  sameDay,
  shouldAutoExpand,
  startOfMonth,
  startOfWeek,
  ymd,
  ym,
} from './calendar-utils';
import type {
  CalendarColor,
  CalendarFilters,
  CalendarItem,
  CalendarView,
  EventTone,
  RenderContext,
} from './types';

export interface CalendarController {
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
  onYearChange: (year: number) => void;
  onViewChange: (view: CalendarView) => void;
  onFilterChange: (key: keyof CalendarFilters) => void;
  onHoursToggle: () => void;
  onMiniPrev: () => void;
  onMiniNext: () => void;
  onMiniSelect: (date: Date) => void;
  onQuickUpload: (eventId: string) => void;
  onItemClick: (item: CalendarItem, element: HTMLElement) => void;
  onCreateAt: (date: Date) => void;
}

type ElAttrs = Record<string, string | number | boolean | null | undefined> & {
  class?: string;
  text?: string;
  html?: string;
  style?: string;
};

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: ElAttrs = {},
  children: Array<Node | string | null | undefined> = [],
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') { e.className = String(v); continue; }
    if (k === 'text') { e.textContent = String(v); continue; }
    if (k === 'html') { e.innerHTML = String(v); continue; }
    if (k === 'style') { e.style.cssText = String(v); continue; }
    if (k === 'value') { (e as unknown as { value: string }).value = String(v); continue; }
    if (k === 'checked' || k === 'selected' || k === 'disabled' || k === 'readOnly' || k === 'multiple') {
      (e as unknown as Record<string, boolean>)[k] = Boolean(v);
      continue;
    }
    if (v === true) { e.setAttribute(k, ''); continue; }
    e.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined) continue;
    e.append(c);
  }
  return e;
}

let controller: CalendarController | null = null;

function ensureIndexedFor(ctx: RenderContext, monthDate: Date): void {
  const state = ctx.state;
  if (state.indexedVersion !== state.dataVersion) {
    state.monthIndex.clear();
    state.indexedVersion = state.dataVersion;
  }
  const key = ym(monthDate);
  if (state.monthIndex.has(key)) return;

  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999);
  const items: CalendarItem[] = [];
  const files = ctx.filesByEventId ?? {};

  for (const e of ctx.events) {
    const vis = e.visibility ?? 'public';
    const isCreator = Boolean(ctx.currentUserId && e.created_by && e.created_by === ctx.currentUserId);

    if (vis === 'private' && !isCreator) continue;
    if (vis === 'private' && !state.filters.myEvents) continue;
    if (vis === 'department' && !state.filters.deptEvents) continue;
    if (vis === 'public' && !state.filters.clubEvents) continue;

    let start: Date;
    let end: Date;

    if (e.start_time) {
      start = new Date(e.start_time);
      end = e.end_time ? new Date(e.end_time) : new Date(start.getTime() + 3_600_000);
    } else if (typeof e.day === 'number' && e.time) {
      const tIdx = (state.today.getDay() + 6) % 7;
      const d = addDays(state.today, e.day - tIdx);
      const [hh, mm] = e.time.split(':');
      d.setHours(parseInt(hh, 10), parseInt(mm ?? '0', 10), 0, 0);
      start = d;
      end = new Date(d.getTime() + 2 * 3_600_000);
    } else {
      continue;
    }

    if (end < monthStart || start > monthEnd) continue;

    const c = CAL_COLORS[e.tone] ?? CAL_COLORS.violet;
    const fileCount = (files[e.id] ?? []).length;

    const cur = new Date(Math.max(start.getTime(), monthStart.getTime()));
    const last = new Date(Math.min(end.getTime(), monthEnd.getTime()));
    cur.setHours(0, 0, 0, 0);
    last.setHours(23, 59, 59, 999);

    while (cur <= last) {
      items.push({
        type: 'event',
        id: e.id,
        title: e.title || e.label || 'Sự kiện',
        date: new Date(cur),
        start,
        end,
        tone: e.tone,
        colorCls: c,
        icon: e.icon || 'fa-calendar',
        fileCount,
        isMultiDay: start.toDateString() !== end.toDateString(),
        raw: e,
      });
      cur.setDate(cur.getDate() + 1);
    }
  }

  for (const t of ctx.tasks) {
    const dlStr = t.deadline_current ?? t.deadline_original;
    if (!dlStr) continue;
    const dl = parseYmd(dlStr);
    if (!dl || dl < monthStart || dl > monthEnd) continue;

    const isDone = t.status === 'approved';
    if (isDone && !state.filters.showDone) continue;
    if (!state.filters.tasks) continue;

    const dept = ctx.departments.find((x) => x.id === t.department_id);
    const info = getDeadlineInfo(dlStr);
    items.push({
      type: 'task',
      id: t.id,
      title: t.title,
      date: new Date(dl),
      start: dl,
      end: dl,
      tone: dept?.color ?? 'violet',
      colorCls: isDone ? { ...info, opacity: 'opacity-50' } : info,
      icon: isDone ? 'fa-circle-check' : 'fa-list-check',
      isDone,
      taskRaw: t,
      dept,
    });
  }

  items.sort((a, b) => a.start.getTime() - b.start.getTime());
  state.monthIndex.set(key, items);
}

function getItemsOnDate(ctx: RenderContext, date: Date): CalendarItem[] {
  ensureIndexedFor(ctx, date);
  const all = ctx.state.monthIndex.get(ym(date)) ?? [];
  const target = ymd(date);
  return all.filter((it) => ymd(it.date) === target);
}

export function initCalendarDOM(ctrl: CalendarController): void {
  controller = ctrl;
  const root = document.getElementById('timelineGrid');
  if (!root) return;

  const parent = root.parentElement;
  if (!parent || parent.querySelector('#calWrapper')) return;

  root.classList.add('hidden');

  const wrapper = document.createElement('div');
  wrapper.id = 'calWrapper';
  wrapper.style.cssText =
    'display:flex;flex-direction:column;gap:6px;height:calc(100dvh - 100px);min-height:400px;overflow:hidden;';
  parent.insertBefore(wrapper, root);
  parent.style.overflow = 'hidden';

  wrapper.innerHTML = `
    <div class="flex items-center gap-1.5 flex-wrap px-2.5 py-1.5 rounded-2xl glass border border-white/[.06] shrink-0">
      <button id="calTodayBtn" class="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] font-bold text-white border border-white/[.06] transition">Hôm nay</button>
      <button id="calPrevBtn" class="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-white flex items-center justify-center transition"><i class="fa-solid fa-chevron-left text-[10px]"></i></button>
      <button id="calNextBtn" class="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-white flex items-center justify-center transition"><i class="fa-solid fa-chevron-right text-[10px]"></i></button>
      <div id="calTitle" class="font-black text-white text-sm ml-1"></div>
      <select id="calYearSelect" class="ml-1 px-2 py-1 rounded-lg bg-black/40 border border-white/[.08] text-[11px] font-black text-white cursor-pointer focus:outline-none"></select>
      <div class="flex-1"></div>
      <button id="calHoursToggle" class="hidden px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] font-bold text-slate-400 hover:text-white border border-white/[.06] transition flex items-center gap-1">
        <i class="fa-solid fa-clock text-[9px]"></i><span>06-23h</span>
      </button>
      <div id="calViewSwitcher" class="flex gap-0.5 p-0.5 rounded-lg bg-black/30 border border-white/[.06]"></div>
    </div>

    <div class="flex-1 flex gap-4 min-h-0 overflow-hidden">
      <aside class="calendar-sidebar flex flex-col gap-4 shrink-0 overflow-y-auto scrollbar">
        <div class="cal-panel shrink-0">
          <h3 class="text-sm font-bold text-white mb-3">Lịch hiển thị</h3>
          <div id="calFilterList" class="flex flex-wrap gap-2"></div>
        </div>

        <div class="cal-panel flex-1">
          <h3 class="text-sm font-bold text-white mb-2">Sắp diễn ra</h3>
          <div id="upcomingList" class="text-xs text-slate-400">Chưa có sự kiện nào sắp tới.</div>
        </div>
      </aside>

      <div class="flex-1 flex flex-col min-h-0 min-w-0">
        <div id="calBody" class="cal-panel flex-1 min-h-0 p-0" aria-label="Lịch cuộn ngang"></div>
        <div id="calLegendStrip" class="shrink-0 flex items-center justify-center gap-3 flex-wrap px-2 py-2 mt-2 rounded-xl glass border border-white/[.06] text-[10px]">
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-pink-500"></span><span class="text-slate-400">Thiết kế / UI</span></span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-cyan-500"></span><span class="text-slate-400">Backend / Hạ tầng</span></span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-violet-500"></span><span class="text-slate-400">Họp / Sync</span></span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-amber-500"></span><span class="text-slate-400">Khác</span></span>
        </div>
      </div>
    </div>
  `;

  wrapper.querySelector<HTMLButtonElement>('#calTodayBtn')!.onclick = () => ctrl.onToday();
  wrapper.querySelector<HTMLButtonElement>('#calPrevBtn')!.onclick = () => ctrl.onPrev();
  wrapper.querySelector<HTMLButtonElement>('#calNextBtn')!.onclick = () => ctrl.onNext();
  wrapper.querySelector<HTMLSelectElement>('#calYearSelect')!.onchange = (e) => {
    const v = (e.target as HTMLSelectElement).value;
    ctrl.onYearChange(parseInt(v, 10));
  };
  wrapper.querySelector<HTMLButtonElement>('#miniPrev')?.addEventListener('click', () => ctrl.onMiniPrev());
  wrapper.querySelector<HTMLButtonElement>('#miniNext')?.addEventListener('click', () => ctrl.onMiniNext());
  wrapper.querySelector<HTMLButtonElement>('#calHoursToggle')!.onclick = () => ctrl.onHoursToggle();
  const calendarBody = wrapper.querySelector<HTMLElement>('#calBody')!;
  calendarBody.tabIndex = 0;
  calendarBody.addEventListener('keydown', event => {
    if (event.target !== calendarBody || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    calendarBody.scrollBy({ left: event.key === 'ArrowRight' ? 120 : -120, behavior: 'smooth' });
  });
}

export function renderCalendar(ctx: RenderContext): void {
  if (!controller) return;
  renderYearSelect(ctx);
  renderViewSwitcher(ctx);
  renderFilterList(ctx);
  renderCalHeader(ctx);
  renderCalBody(ctx);
  renderMiniCalendar(ctx);
  updateHoursToggleLabel(ctx);
}

function renderCalHeader(ctx: RenderContext): void {
  const t = document.getElementById('calTitle');
  const sel = document.getElementById('calYearSelect') as HTMLSelectElement | null;
  if (!t) return;

  const d = ctx.state.cursor;
  if (sel) sel.value = String(d.getFullYear());

  if (ctx.state.view === 'month') {
    t.textContent = `${VI_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  } else if (ctx.state.view === 'week') {
    const s = startOfWeek(d);
    const e = addDays(s, 6);
    t.textContent = `${s.getDate()}/${s.getMonth() + 1} – ${e.getDate()}/${e.getMonth() + 1}/${e.getFullYear()}`;
  } else {
    t.textContent = `${VI_DAYS_FULL[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  }

  ctx.state.miniMonth = new Date(d.getFullYear(), d.getMonth(), 1);
}

function renderCalBody(ctx: RenderContext): void {
  const body = document.getElementById('calBody');
  if (!body) return;
  if (ctx.state.rendering) return;
  ctx.state.rendering = true;
  try {
    ensureIndexedFor(ctx, ctx.state.cursor);
    body.replaceChildren();
    if (ctx.state.view === 'month') body.appendChild(buildMonthView(ctx));
    else if (ctx.state.view === 'week') body.appendChild(buildWeekView(ctx));
    else body.appendChild(buildDayView(ctx));
    body.dataset.view = ctx.state.view;
  } finally {
    ctx.state.rendering = false;
  }
}

function buildMonthView(ctx: RenderContext): HTMLElement {
  if (!controller) throw new Error('Calendar controller chưa init');

  const wrap = document.createElement('div');
  wrap.className = 'h-full flex flex-col';

  const hdr = document.createElement('div');
  hdr.className = 'grid grid-cols-7 border-b border-white/[.06] shrink-0';
  for (const d of VI_DAYS_SHORT) {
    const cell = document.createElement('div');
    cell.className =
      'py-1 text-center text-[10px] font-black text-slate-400 uppercase tracking-wider border-r border-white/[.04] last:border-r-0';
    cell.textContent = d;
    hdr.appendChild(cell);
  }
  wrap.appendChild(hdr);

  const gridStart = startOfWeek(startOfMonth(ctx.state.cursor));
  const grid = document.createElement('div');
  grid.className = 'flex-1 grid grid-rows-6 min-h-0';

  for (let w = 0; w < 6; w++) {
    const row = document.createElement('div');
    row.className = 'grid grid-cols-7 border-b border-white/[.04] last:border-b-0 min-h-0';

    for (let i = 0; i < 7; i++) {
      const date = addDays(gridStart, w * 7 + i);
      const inMonth = date.getMonth() === ctx.state.cursor.getMonth();
      const isTd = isToday(date, ctx.state.today);

      const cell = document.createElement('div');
      cell.className =
        `p-0.5 border-r border-white/[.04] last:border-r-0 cursor-pointer overflow-hidden ` +
        (isTd ? 'bg-pink-500/[.06]' : inMonth ? '' : 'bg-black/40') +
        ' hover:bg-white/[.03]';
      cell.dataset.date = ymd(date);

      const dNum = document.createElement('span');
      dNum.className =
        `inline-block text-[10px] font-black px-1 py-px rounded mb-0.5 leading-none ` +
        (isTd ? 'bg-pink-500 text-white' : inMonth ? 'text-white' : 'text-slate-600');
      dNum.textContent = String(date.getDate());
      cell.appendChild(dNum);

      const items = aggregateDuplicates(getItemsOnDate(ctx, date));
      const max = 2;
      items.slice(0, max).forEach((it) => cell.appendChild(buildMiniItem(it)));
      if (items.length > max) {
        const more = document.createElement('div');
        more.className =
          'text-[8px] text-slate-500 font-bold px-1 cursor-pointer hover:text-white leading-none';
        more.textContent = `+${items.length - max}`;
        more.dataset.gotoDay = ymd(date);
        cell.appendChild(more);
      }
      row.appendChild(cell);
    }
    grid.appendChild(row);
  }
  wrap.appendChild(grid);

  wrap.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    const upQuick = target.closest<HTMLElement>('[data-up-quick]');
    if (upQuick && upQuick.dataset.upQuick) {
      e.stopPropagation();
      e.preventDefault();
      controller!.onQuickUpload(upQuick.dataset.upQuick);
      return;
    }

    const gotoDay = target.closest<HTMLElement>('[data-goto-day]');
    if (gotoDay && gotoDay.dataset.gotoDay) {
      e.stopPropagation();
      const [y, m, d] = gotoDay.dataset.gotoDay.split('-').map(Number);
      ctx.state.view = 'day';
      ctx.state.cursor = new Date(y, m - 1, d);
      renderAll(ctx);
      return;
    }

    const itemEl = target.closest<HTMLElement>('[data-item-type][data-item-id]');
    if (itemEl) {
      const itemId = itemEl.dataset.itemId;
      const itemType = itemEl.dataset.itemType;
      if (!itemId || !itemType) return;
      const found =
        findItemAcrossIndex(ctx, itemId, itemType) ??
        getItemsOnDate(ctx, ctx.state.cursor).find((it) => it.id === itemId && it.type === itemType);
      if (found) {
        e.stopPropagation();
        controller!.onItemClick(found, itemEl);
      }
      return;
    }

    const cell = target.closest<HTMLElement>('[data-date]');
    if (cell && cell.dataset.date) {
      const [y, m, d] = cell.dataset.date.split('-').map(Number);
      ctx.state.view = 'day';
      ctx.state.cursor = new Date(y, m - 1, d);
      renderAll(ctx);
    }
  });

  return wrap;
}

function findItemAcrossIndex(ctx: RenderContext, id: string, type: string): CalendarItem | undefined {
  for (const list of ctx.state.monthIndex.values()) {
    const hit = list.find((it) => it.id === id && it.type === type);
    if (hit) return hit;
  }
  return undefined;
}

function renderAll(ctx: RenderContext): void {
  renderViewSwitcher(ctx);
  updateHoursToggleLabel(ctx);
  renderCalHeader(ctx);
  renderCalBody(ctx);
  renderMiniCalendar(ctx);
}

function buildWeekView(ctx: RenderContext): HTMLElement {
  if (!controller) throw new Error('Calendar controller chưa init');

  const wrap = document.createElement('div');
  wrap.className = 'h-full flex flex-col';

  const weekStart = startOfWeek(ctx.state.cursor);
  const weekDates: Date[] = [];
  for (let i = 0; i < 7; i++) weekDates.push(addDays(weekStart, i));

  if (!ctx.state.extendedHours && shouldAutoExpand(weekDates, (d) => getItemsOnDate(ctx, d))) {
    ctx.state.extendedHours = true;
    updateHoursToggleLabel(ctx);
  }

  const { start: START_H, end: END_H, total: TOTAL } = getTimeRange(ctx.state.extendedHours);

  const hdr = document.createElement('div');
  hdr.className = 'grid grid-cols-[44px_repeat(7,1fr)] border-b border-white/[.06] shrink-0';
  hdr.appendChild(document.createElement('div'));
  for (let i = 0; i < 7; i++) {
    const date = weekDates[i];
    const isTd = isToday(date, ctx.state.today);
    const cell = document.createElement('div');
    cell.className =
      `py-1 px-1 text-center border-l border-white/[.04] ` + (isTd ? 'bg-pink-500/[.06]' : '');
    cell.innerHTML =
      `<div class="text-[9px] font-black text-slate-500 uppercase">${VI_DAYS_SHORT[i]}</div>` +
      `<div class="text-xs font-black ${isTd ? 'text-pink-300' : 'text-white'} leading-tight">${date.getDate()}</div>`;
    hdr.appendChild(cell);
  }
  wrap.appendChild(hdr);

  const bodyWrap = document.createElement('div');
  bodyWrap.className = 'flex-1 grid grid-cols-[44px_repeat(7,1fr)] relative min-h-0';

  const HH = Math.max(20, Math.floor((window.innerHeight - 240) / TOTAL));

  const timeCol = document.createElement('div');
  timeCol.className = 'border-r border-white/[.04]';
  for (let h = START_H; h < END_H; h++) {
    const slot = document.createElement('div');
    slot.className = 'text-[8px] text-slate-500 text-right pr-1 font-bold tabular-nums leading-none';
    slot.style.height = HH + 'px';
    slot.style.paddingTop = '1px';
    slot.textContent = `${String(h).padStart(2, '0')}h`;
    timeCol.appendChild(slot);
  }
  bodyWrap.appendChild(timeCol);

  for (let i = 0; i < 7; i++) {
    const date = weekDates[i];
    const col = document.createElement('div');
    col.className =
      `relative border-l border-white/[.04] ` + (isToday(date, ctx.state.today) ? 'bg-pink-500/[.02]' : '');

    for (let h = START_H; h < END_H; h++) {
      const line = document.createElement('div');
      line.className = 'absolute left-0 right-0 border-t border-white/[.03] pointer-events-none';
      line.style.top = (h - START_H) * HH + 'px';
      col.appendChild(line);
    }

    if (isToday(date, ctx.state.today)) {
      const now = new Date();
      const hNow = now.getHours();
      if (hNow >= START_H && hNow < END_H) {
        const top = (minutesFromMidnight(now) / 60 - START_H) * HH;
        const ind = document.createElement('div');
        ind.className = 'absolute left-0 right-0 z-30 pointer-events-none';
        ind.style.top = top + 'px';
        ind.innerHTML =
          '<div class="relative"><div class="absolute -left-0.5 -top-0.5 w-1 h-1 rounded-full bg-rose-500"></div><div class="h-px bg-rose-500 w-full"></div></div>';
        col.appendChild(ind);
      }
    }

    const raw = getItemsOnDate(ctx, date).filter((it) => it.type === 'event');
    const items = aggregateDuplicates(raw);
    const layouts = calculateOverlapLayouts(items);

    for (const lay of layouts) {
      const sMin = minutesFromMidnight(lay.event.start);
      const eMin = minutesFromMidnight(lay.event.end);
      const top = Math.max(0, (sMin / 60 - START_H) * HH);
      const hgt = Math.max(14, ((eMin - sMin) / 60) * HH);
      const c = lay.event.colorCls || CAL_COLORS.violet;
      const cnt = (lay.event.count ?? 0) > 1 ? ` ×${lay.event.count}` : '';
      const more = lay.hasMore ? ` +${lay.moreCount ?? 0}` : '';
      const fileBadge = (lay.event.fileCount ?? 0) > 0 ? ` 📎${lay.event.fileCount}` : '';

      const vis = lay.event.raw?.visibility;
      const visIcon = vis === 'private' ? '🔒 ' : vis === 'department' ? '🏢 ' : '';

      const evEl = document.createElement('div');
      evEl.className =
        `group absolute rounded border px-1 cursor-pointer ${c.bg} ${c.border} ${c.text} hover:opacity-90 transition overflow-hidden`;
      evEl.style.cssText = `top:${top}px;height:${hgt}px;left:${lay.left}%;width:${lay.width}%;z-index:${lay.z};`;
      evEl.title = `${visIcon}${lay.event.title}${cnt}${fileBadge}\n${formatTime(lay.event.start)} - ${formatTime(lay.event.end)}${more}`;
      evEl.innerHTML =
        `<div class="text-[9px] font-black truncate leading-tight">${visIcon}${escHtml(lay.event.title)}${cnt}${more}</div>` +
        (hgt > 22
          ? `<div class="text-[7px] opacity-70 leading-tight">${fileBadge || formatTime(lay.event.start)}</div>`
          : '');

      const upBtn = document.createElement('span');
      upBtn.className =
        'cal-up-quick absolute right-0.5 top-0.5 w-4 h-4 rounded flex items-center justify-center bg-violet-500/50 text-white text-[8px]';
      upBtn.innerHTML = '<i class="fa-solid fa-paperclip"></i>';
      upBtn.dataset.upQuick = lay.event.id;
      upBtn.title = 'Upload file';
      evEl.appendChild(upBtn);

      evEl.dataset.itemType = 'event';
      evEl.dataset.itemId = lay.event.id;
      col.appendChild(evEl);
    }

    col.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;

      const upQuick = t.closest<HTMLElement>('[data-up-quick]');
      if (upQuick && upQuick.dataset.upQuick) {
        e.stopPropagation();
        e.preventDefault();
        controller!.onQuickUpload(upQuick.dataset.upQuick);
        return;
      }

      const itemEl = t.closest<HTMLElement>('[data-item-type][data-item-id]');
      if (itemEl && itemEl.dataset.itemId) {
        const found =
          findItemAcrossIndex(ctx, itemEl.dataset.itemId, itemEl.dataset.itemType ?? 'event') ??
          getItemsOnDate(ctx, date).find((it) => it.id === itemEl.dataset.itemId);
        if (found) {
          e.stopPropagation();
          controller!.onItemClick(found, itemEl);
        }
        return;
      }

      const rect = col.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      const cMins = Math.floor(((clickY / HH) * 60) / 15) * 15;
      const d = new Date(date);
      d.setHours(Math.floor(cMins / 60) + START_H, cMins % 60, 0, 0);
      controller!.onCreateAt(d);
    });

    bodyWrap.appendChild(col);
  }

  wrap.appendChild(bodyWrap);
  return wrap;
}

function buildDayView(ctx: RenderContext): HTMLElement {
  if (!controller) throw new Error('Calendar controller chưa init');

  const wrap = document.createElement('div');
  wrap.className = 'h-full flex flex-col';

  const date = ctx.state.cursor;
  const isTd = isToday(date, ctx.state.today);

  if (!ctx.state.extendedHours && shouldAutoExpand([date], (d) => getItemsOnDate(ctx, d))) {
    ctx.state.extendedHours = true;
    updateHoursToggleLabel(ctx);
  }

  const { start: START_H, end: END_H, total: TOTAL } = getTimeRange(ctx.state.extendedHours);

  const hdr = document.createElement('div');
  hdr.className = 'flex items-center justify-between px-2 py-1 border-b border-white/[.06] shrink-0';
  hdr.innerHTML =
    `<div class="flex items-baseline gap-2">` +
    `<div class="text-base font-black text-white leading-none">${date.getDate()}</div>` +
    `<div class="text-[10px] text-slate-500">${VI_DAYS_FULL[date.getDay()]}, ${VI_MONTHS[date.getMonth()]}</div>` +
    `</div>` +
    `<button id="calDayAddBtn" class="px-2 py-1 rounded-lg bg-gradient-to-r from-pink-600 to-violet-600 text-white text-[10px] font-black shadow-neon-pink hover:opacity-95 transition flex items-center gap-1">` +
    `<i class="fa-solid fa-plus text-[8px]"></i><span>Thêm</span></button>`;
  wrap.appendChild(hdr);

  const grid = document.createElement('div');
  grid.className = 'flex-1 grid grid-cols-[44px_1fr] relative min-h-0';

  const HH = Math.max(20, Math.floor((window.innerHeight - 240) / TOTAL));

  const timeCol = document.createElement('div');
  timeCol.className = 'border-r border-white/[.04]';
  for (let h = START_H; h < END_H; h++) {
    const slot = document.createElement('div');
    slot.className = 'text-[8px] text-slate-500 text-right pr-1 font-bold tabular-nums leading-none';
    slot.style.height = HH + 'px';
    slot.style.paddingTop = '1px';
    slot.textContent = `${String(h).padStart(2, '0')}h`;
    timeCol.appendChild(slot);
  }
  grid.appendChild(timeCol);

  const mainCol = document.createElement('div');
  mainCol.className = 'relative';

  for (let h = START_H; h < END_H; h++) {
    const line = document.createElement('div');
    line.className = 'absolute left-0 right-0 border-t border-white/[.03] pointer-events-none';
    line.style.top = (h - START_H) * HH + 'px';
    mainCol.appendChild(line);
  }

  if (isTd) {
    const now = new Date();
    const hNow = now.getHours();
    if (hNow >= START_H && hNow < END_H) {
      const top = (minutesFromMidnight(now) / 60 - START_H) * HH;
      const ind = document.createElement('div');
      ind.className = 'absolute left-0 right-0 z-30 pointer-events-none';
      ind.style.top = top + 'px';
      ind.innerHTML =
        '<div class="relative"><div class="absolute -left-0.5 -top-0.5 w-1 h-1 rounded-full bg-rose-500"></div><div class="h-px bg-rose-500 w-full"></div></div>';
      mainCol.appendChild(ind);
    }
  }

  const raw = getItemsOnDate(ctx, date).filter((it) => it.type === 'event');
  const items = aggregateDuplicates(raw);
  const layouts = calculateOverlapLayouts(items);

  for (const lay of layouts) {
    const sMin = minutesFromMidnight(lay.event.start);
    const eMin = minutesFromMidnight(lay.event.end);
    const top = Math.max(0, (sMin / 60 - START_H) * HH);
    const hgt = Math.max(16, ((eMin - sMin) / 60) * HH);
    const c = lay.event.colorCls || CAL_COLORS.violet;
    const cnt = (lay.event.count ?? 0) > 1 ? ` ×${lay.event.count}` : '';
    const more = lay.hasMore ? ` +${lay.moreCount ?? 0}` : '';
    const fileBadge = (lay.event.fileCount ?? 0) > 0 ? ` 📎${lay.event.fileCount}` : '';

    const vis = lay.event.raw?.visibility;
    const visIcon = vis === 'private' ? '🔒 ' : vis === 'department' ? '🏢 ' : '';

    const evEl = document.createElement('div');
    evEl.className =
      `group absolute rounded border px-1.5 cursor-pointer ${c.bg} ${c.border} ${c.text} hover:opacity-90 transition overflow-hidden`;
    evEl.style.cssText = `top:${top}px;height:${hgt}px;left:${lay.left * 0.98 + 1}%;width:${lay.width * 0.98}%;z-index:${lay.z};`;
    evEl.title = `${visIcon}${lay.event.title}${cnt}${fileBadge}\n${formatTime(lay.event.start)} - ${formatTime(lay.event.end)}${more}`;
    evEl.innerHTML =
      `<div class="text-[10px] font-black truncate leading-tight">${visIcon}${escHtml(lay.event.title)}${cnt}${more}</div>` +
      (hgt > 26
        ? `<div class="text-[8px] opacity-70 leading-tight">${fileBadge || formatTime(lay.event.start)}</div>`
        : '');

    const upBtn = document.createElement('span');
    upBtn.className =
      'cal-up-quick absolute right-1 top-1 w-5 h-5 rounded flex items-center justify-center bg-violet-500/50 text-white text-[10px]';
    upBtn.innerHTML = '<i class="fa-solid fa-paperclip"></i>';
    upBtn.dataset.upQuick = lay.event.id;
    upBtn.title = 'Upload file vào sự kiện';
    evEl.appendChild(upBtn);

    evEl.dataset.itemType = 'event';
    evEl.dataset.itemId = lay.event.id;
    mainCol.appendChild(evEl);
  }

  mainCol.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;

    const upQuick = t.closest<HTMLElement>('[data-up-quick]');
    if (upQuick && upQuick.dataset.upQuick) {
      e.stopPropagation();
      e.preventDefault();
      controller!.onQuickUpload(upQuick.dataset.upQuick);
      return;
    }

    const itemEl = t.closest<HTMLElement>('[data-item-type][data-item-id]');
    if (itemEl && itemEl.dataset.itemId) {
      const found = getItemsOnDate(ctx, date).find((it) => it.id === itemEl.dataset.itemId);
      if (found) {
        e.stopPropagation();
        controller!.onItemClick(found, itemEl);
      }
      return;
    }

    const rect = mainCol.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const cMins = Math.floor(((clickY / HH) * 60) / 15) * 15;
    const d = new Date(date);
    d.setHours(Math.floor(cMins / 60) + START_H, cMins % 60, 0, 0);
    controller!.onCreateAt(d);
  });

  grid.appendChild(mainCol);
  wrap.appendChild(grid);

  setTimeout(() => {
    document
      .getElementById('calDayAddBtn')
      ?.addEventListener('click', () => controller!.onCreateAt(ctx.state.cursor));
  }, 0);

  return wrap;
}

function renderMiniCalendar(ctx: RenderContext): void {
  if (!controller) return;
  const grid = document.getElementById('miniGrid');
  const title = document.getElementById('miniTitle');
  if (!grid) return;

  if (title) {
    title.textContent = `${VI_MONTHS[ctx.state.miniMonth.getMonth()]} ${ctx.state.miniMonth.getFullYear()}`;
  }
  grid.replaceChildren();

  for (const d of VI_DAYS_SHORT) {
    const c = document.createElement('div');
    c.className = 'text-[8px] font-black text-slate-500 py-0.5';
    c.textContent = d[1];
    grid.appendChild(c);
  }

  const gridStart = startOfWeek(startOfMonth(ctx.state.miniMonth));
  const monthNum = ctx.state.miniMonth.getMonth();
  const frag = document.createDocumentFragment();

  for (let w = 0; w < 6; w++) {
    for (let i = 0; i < 7; i++) {
      const date = addDays(gridStart, w * 7 + i);
      const inMonth = date.getMonth() === monthNum;
      const isTd = isToday(date, ctx.state.today);
      const isCursor = sameDay(date, ctx.state.cursor);

      ensureIndexedFor(ctx, date);
      const hasItems = getItemsOnDate(ctx, date).length > 0;

      const btn = document.createElement('button');
      btn.className =
        `relative aspect-square rounded text-[9px] font-bold transition ` +
        (isTd
          ? 'bg-pink-500 text-white'
          : isCursor
            ? 'bg-violet-500/30 text-violet-200'
            : inMonth
              ? 'text-slate-300 hover:bg-white/10'
              : 'text-slate-600 hover:bg-white/5');
      btn.textContent = String(date.getDate());

      if (hasItems && !isTd) {
        const dot = document.createElement('span');
        dot.className =
          'absolute bottom-0.5 left-1/2 -translate-x-1/2 w-0.5 h-0.5 rounded-full bg-violet-400';
        btn.appendChild(dot);
      }

      const dc = new Date(date);
      btn.addEventListener('click', () => controller!.onMiniSelect(dc));
      frag.appendChild(btn);
    }
  }
  grid.appendChild(frag);
}

function updateHoursToggleLabel(ctx: RenderContext): void {
  const btn = document.getElementById('calHoursToggle');
  if (!btn) return;

  if (ctx.state.view === 'month') {
    btn.classList.add('hidden');
    return;
  }
  btn.classList.remove('hidden');

  const span = btn.querySelector('span');
  if (ctx.state.extendedHours) {
    btn.className =
      'px-2 py-1 rounded-lg bg-violet-500/20 text-[10px] font-bold text-violet-200 border border-violet-500/40 transition flex items-center gap-1';
    if (span) span.textContent = '00-24h';
  } else {
    btn.className =
      'px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] font-bold text-slate-400 hover:text-white border border-white/[.06] transition flex items-center gap-1';
    if (span) span.textContent = '06-23h';
  }
}

function renderViewSwitcher(ctx: RenderContext): void {
  if (!controller) return;
  const sw = document.getElementById('calViewSwitcher');
  if (!sw) return;
  sw.replaceChildren();

  const opts: Array<{ k: CalendarView; l: string }> = [
    { k: 'day', l: 'Ngày' },
    { k: 'week', l: 'Tuần' },
    { k: 'month', l: 'Tháng' },
  ];

  for (const o of opts) {
    const btn = document.createElement('button');
    const active = ctx.state.view === o.k;
    btn.setAttribute('aria-pressed', String(active));
    btn.className =
      `px-2 py-1 rounded-md text-[10px] font-black transition ` +
      (active
        ? 'bg-violet-500/30 text-violet-200'
        : 'text-slate-400 hover:text-white hover:bg-white/5');
    btn.textContent = o.l;
    btn.addEventListener('click', () => controller!.onViewChange(o.k));
    sw.appendChild(btn);
  }
}

function renderFilterList(ctx: RenderContext): void {
  if (!controller) return;
  const list = document.getElementById('calFilterList');
  if (!list) return;
  list.replaceChildren();

  const filters: Array<{ k: keyof CalendarFilters; l: string; color: EventTone }> = [
    { k: 'myEvents', l: 'Lịch cá nhân', color: 'pink' },
    { k: 'deptEvents', l: 'Lịch ban của tôi', color: 'cyan' },
    { k: 'clubEvents', l: 'Lịch chung CLB', color: 'violet' },
    { k: 'tasks', l: 'Công việc', color: 'amber' },
    { k: 'showDone', l: 'Đã xong', color: 'emerald' },
  ];

  for (const f of filters) {
    const row = document.createElement('label');
    row.className = 'flex items-center gap-1.5 p-1 rounded hover:bg-white/5 cursor-pointer transition';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.setAttribute('aria-label', f.l);
    cb.checked = Boolean(ctx.state.filters[f.k]);
    cb.className = 'w-3 h-3 accent-violet-500 cursor-pointer';

    const dot = document.createElement('span');
    dot.className = `w-1.5 h-1.5 rounded-full ${CAL_COLORS[f.color].solid}`;

    const txt = document.createElement('span');
    txt.className = 'text-[10px] text-slate-300 flex-1';
    txt.textContent = f.l;

    cb.addEventListener('change', () => controller!.onFilterChange(f.k));

    row.append(cb, dot, txt);
    list.appendChild(row);
  }
}

function renderYearSelect(ctx: RenderContext): void {
  const sel = document.getElementById('calYearSelect') as HTMLSelectElement | null;
  if (!sel) return;

  const cur = ctx.state.cursor.getFullYear();
  sel.replaceChildren();

  const frag = document.createDocumentFragment();
  for (let y = 2020; y <= 2035; y++) {
    const o = document.createElement('option');
    o.value = String(y);
    o.textContent = String(y);
    if (y === cur) o.selected = true;
    frag.appendChild(o);
  }
  sel.appendChild(frag);
}

function buildMiniItem(it: CalendarItem): HTMLElement {
  const c: CalendarColor = it.colorCls || CAL_COLORS.violet;
  const div = document.createElement('div');

  const multi = it.isMultiDay && it.type === 'event' ? '↔' : '';
  const cnt = (it.count ?? 0) > 1 ? ` ×${it.count}` : '';
  const done = it.isDone ? '✓' : '';
  const fileBadge = it.type === 'event' && (it.fileCount ?? 0) > 0 ? ` 📎${it.fileCount}` : '';

  const vis = it.raw?.visibility;
  const visIcon = vis === 'private' ? '🔒 ' : vis === 'department' ? '🏢 ' : '';

  div.className =
    `group relative text-[8px] leading-tight px-1 rounded mb-px cursor-pointer truncate ${c.bg} ${c.text} ${c.opacity ?? ''} hover:opacity-90`;
  div.innerHTML = `<span class="truncate">${visIcon}${done}${multi}${escHtml(it.title)}${cnt}${fileBadge}</span>`;

  if (it.type === 'event') {
    const upBtn = document.createElement('span');
    upBtn.className =
      'cal-up-quick absolute right-0 top-0 w-3.5 h-3.5 rounded-sm flex items-center justify-center bg-violet-500/40 text-white text-[7px]';
    upBtn.innerHTML = '<i class="fa-solid fa-paperclip"></i>';
    upBtn.dataset.upQuick = it.id;
    upBtn.title = 'Upload file vào sự kiện';
    div.appendChild(upBtn);
  }

  div.dataset.itemType = it.type;
  div.dataset.itemId = it.id;
  return div;
}
