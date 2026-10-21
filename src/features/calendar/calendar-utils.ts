// ============================================================
// FPC HUB v15 · Calendar Module — Utils (date math + layout)
// Port y nguyên từ 06a-calendar.js / 06b-mini-cal.js / 06-views.js
// ============================================================

import type {
  CalendarColor,
  CalendarItem,
  CalendarLayout,
  EventTone,
  TimeRange,
} from './types';

/* ─── Constants ─────────────────────────────────────────── */

export const VI_DAYS_FULL = [
  'Chủ nhật',
  'Thứ 2',
  'Thứ 3',
  'Thứ 4',
  'Thứ 5',
  'Thứ 6',
  'Thứ 7',
] as const;

export const VI_DAYS_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] as const;

export const VI_MONTHS = [
  'Tháng 1',
  'Tháng 2',
  'Tháng 3',
  'Tháng 4',
  'Tháng 5',
  'Tháng 6',
  'Tháng 7',
  'Tháng 8',
  'Tháng 9',
  'Tháng 10',
  'Tháng 11',
  'Tháng 12',
] as const;

export const CAL_COLORS: Record<EventTone, CalendarColor> = {
  pink:    { bg: 'bg-pink-500/15',    border: 'border-pink-500/40',    text: 'text-pink-300',    solid: 'bg-pink-500' },
  cyan:    { bg: 'bg-cyan-500/15',    border: 'border-cyan-500/40',    text: 'text-cyan-300',    solid: 'bg-cyan-500' },
  violet:  { bg: 'bg-violet-500/15',  border: 'border-violet-500/40',  text: 'text-violet-300',  solid: 'bg-violet-500' },
  amber:   { bg: 'bg-amber-500/15',   border: 'border-amber-500/40',   text: 'text-amber-300',   solid: 'bg-amber-500' },
  emerald: { bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', text: 'text-emerald-300', solid: 'bg-emerald-500' },
};

/* ─── Date helpers ──────────────────────────────────────── */

export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function ym(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function parseYmd(s: string | null | undefined): Date | null {
  if (!s) return null;
  if (s.includes('T')) return new Date(s);
  const parts = s.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, m, d] = parts;
  return new Date(y, m - 1, d);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function startOfWeek(d: Date): Date {
  const dt = new Date(d);
  const diff = dt.getDay() === 0 ? -6 : 1 - dt.getDay();
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isToday(d: Date, today: Date = new Date()): boolean {
  return sameDay(d, today);
}

export function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function minutesFromMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/* ─── Deadline tone (task) ──────────────────────────────── */

export function getDeadlineInfo(dateStr: string | null | undefined): CalendarColor {
  const dl = parseYmd(dateStr);
  if (!dl) {
    return { bg: 'bg-slate-500/10', border: 'border-slate-500/30', text: 'text-slate-400', solid: 'bg-slate-500' };
  }
  dl.setHours(23, 59, 59, 999);
  const diff = dl.getTime() - Date.now();
  const days = diff / 86_400_000;

  if (diff < 0) {
    if (Math.abs(days) > 3) {
      return { bg: 'bg-slate-900/40', border: 'border-slate-700', text: 'text-slate-300', solid: 'bg-slate-700' };
    }
    return { bg: 'bg-rose-500/15', border: 'border-rose-500/40', text: 'text-rose-300', solid: 'bg-rose-500' };
  }
  if (days < 1) {
    return { bg: 'bg-orange-500/15', border: 'border-orange-500/40', text: 'text-orange-300', solid: 'bg-orange-500' };
  }
  if (days < 3) {
    return { bg: 'bg-amber-500/15', border: 'border-amber-500/40', text: 'text-amber-300', solid: 'bg-amber-500' };
  }
  return { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-300', solid: 'bg-emerald-500' };
}

/* ─── Time range ────────────────────────────────────────── */

export function getTimeRange(extendedHours: boolean): TimeRange {
  return extendedHours
    ? { start: 0, end: 24, total: 24 }
    : { start: 6, end: 23, total: 17 };
}

/**
 * Có sự kiện nào rơi ra ngoài khung 06-23h → cần mở rộng 00-24h không.
 */
export function shouldAutoExpand(
  dates: Date[],
  getItemsOnDate: (d: Date) => CalendarItem[],
): boolean {
  for (const date of dates) {
    for (const it of getItemsOnDate(date)) {
      if (it.type !== 'event') continue;
      const h = it.start.getHours();
      if (h < 6 || h >= 23) return true;
    }
  }
  return false;
}

/* ─── Aggregate duplicates ──────────────────────────────── */

export function aggregateDuplicates(items: CalendarItem[]): CalendarItem[] {
  const map = new Map<string, CalendarItem>();
  for (const it of items) {
    const key = `${it.type}|${it.title}|${it.start.getTime()}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...it, count: 1, ids: [it.id] });
    } else {
      existing.count = (existing.count ?? 0) + 1;
      existing.ids = existing.ids ?? [];
      existing.ids.push(it.id);
    }
  }
  return Array.from(map.values());
}

/* ─── Overlap layout (thuật toán chia cột) ──────────────── */

interface WorkItem {
  event: CalendarItem;
  startMin: number;
  endMin: number;
  col: number;
}

/**
 * Chia cột cho các sự kiện trùng giờ trong cùng ngày.
 * - Sắp xếp theo start → end desc.
 * - Gom cụm (cluster) các item chồng chéo.
 * - Trong mỗi cụm: greedy packing vào các cột.
 * - Nếu tổng cột ≤ MAX → hiển thị đủ; nếu > MAX → gộp cột MAX trở đi.
 */
export function calculateOverlapLayouts(events: CalendarItem[]): CalendarLayout[] {
  if (events.length === 0) return [];

  const items: WorkItem[] = events.map((e) => ({
    event: e,
    startMin: minutesFromMidnight(e.start),
    endMin: minutesFromMidnight(e.end),
    col: 0,
  }));

  items.sort((a, b) =>
    a.startMin !== b.startMin ? a.startMin - b.startMin : b.endMin - a.endMin,
  );

  // Gom cụm chồng chéo
  const clusters: WorkItem[][] = [];
  let cl: WorkItem[] = [items[0]];
  let clEnd = items[0].endMin;
  for (let i = 1; i < items.length; i++) {
    if (items[i].startMin < clEnd) {
      cl.push(items[i]);
      clEnd = Math.max(clEnd, items[i].endMin);
    } else {
      clusters.push(cl);
      cl = [items[i]];
      clEnd = items[i].endMin;
    }
  }
  clusters.push(cl);

  const layouts: CalendarLayout[] = [];
  const MAX = 3;

  for (const cluster of clusters) {
    const cols: number[] = []; // endMin của item đang nằm ở cột tương ứng
    for (const it of cluster) {
      let placed = false;
      for (let c = 0; c < cols.length; c++) {
        if (cols[c] <= it.startMin) {
          cols[c] = it.endMin;
          it.col = c;
          placed = true;
          break;
        }
      }
      if (!placed) {
        it.col = cols.length;
        cols.push(it.endMin);
      }
    }

    const total = cols.length;
    if (total <= MAX) {
      for (const it of cluster) {
        if (total === 1) {
          layouts.push({ event: it.event, left: 0, width: 100, z: 20 });
        } else {
          const w = 100 / total;
          layouts.push({ event: it.event, left: it.col * w, width: w - 0.5, z: 20 + it.col });
        }
      }
    } else {
      const w = 100 / MAX;
      for (const it of cluster) {
        if (it.col < MAX - 1) {
          layouts.push({ event: it.event, left: it.col * w, width: w - 0.5, z: 20 + it.col });
        } else if (it.col === MAX - 1) {
          const more = cluster.filter((x) => x.col >= MAX - 1 && x !== it).length;
          layouts.push({
            event: it.event,
            left: (MAX - 1) * w,
            width: w - 0.5,
            z: 20 + it.col,
            hasMore: true,
            moreCount: more,
          });
        }
      }
    }
  }

  return layouts;
}
