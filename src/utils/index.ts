/* ============================================================
   FPC LAB · src/utils/index.ts
   Port từ v14 `01-utils.js` — giữ nguyên logic, chỉ thêm type.
   ============================================================ */

/* --- Re-export từ các file utils khác --- */
export { clamp } from './math';
export { fileIcon, FILE_ICONS } from './file-icons';
export type { FileIconDef } from './file-icons';

/* --- DOM selectors ngắn gọn --- */
export function $<E extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document
): E | null {
  return root.querySelector<E>(selector);
}

export function $$<E extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document
): E[] {
  return Array.from(root.querySelectorAll<E>(selector));
}

/* --- Tạo ID duy nhất --- */
export function uid(prefix: string = 'id'): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  return `${prefix}_${rand}`;
}

/* --- Debounce: chờ user ngừng gõ mới chạy --- */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number = 180
): (...args: A) => void {
  let t: number | undefined;
  return (...args: A): void => {
    if (t !== undefined) window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), ms);
  };
}

/* --- Định dạng thời gian --- */
export function fmtTime(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export function fmtClock(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);
}

export function fmtDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

/* --- Định dạng dung lượng file --- */
export function fmtBytes(b: number): string {
  if (!Number.isFinite(b) || b < 0) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
}

/* --- Hiển thị "2 giờ trước" --- */
export function timeAgo(ts: number): string {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return 'vừa xong';
  if (d < 3600) return `${Math.floor(d / 60)} phút trước`;
  if (d < 86400) return `${Math.floor(d / 3600)}h trước`;
  return `${Math.floor(d / 86400)} ngày trước`;
}

/* --- Tạo DOM element nhanh --- */
export type ElChild = Node | string | null | undefined;

export interface ElProps {
  class?: string;
  text?: string;
  html?: string;
  [attr: string]: unknown;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: ElProps,
  children?: ElChild | ElChild[]
): HTMLElementTagNameMap[K];
export function el(
  tag: string,
  props?: ElProps,
  children?: ElChild | ElChild[]
): HTMLElement;
export function el(
  tag: string,
  props: ElProps = {},
  children: ElChild | ElChild[] = []
): HTMLElement {
  const node = document.createElement(tag);

  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;

    if (k === 'class') {
      node.className = String(v);
    } else if (k === 'text') {
      node.textContent = String(v);
    } else if (k === 'html') {
      node.innerHTML = String(v);
    } else if (k.startsWith('on:') && typeof v === 'function') {
      node.addEventListener(k.slice(3), v as EventListener);
    } else {
      node.setAttribute(k, v === true ? '' : String(v));
    }
  }

  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c == null) continue;
    if (typeof c === 'string') node.append(document.createTextNode(c));
    else node.append(c);
  }

  return node;
}

/* --- Xóa sạch con của 1 element --- */
export function clear(n: Node): void {
  let child = n.firstChild;
  while (child) {
    n.removeChild(child);
    child = n.firstChild;
  }
}

/* --- Hằng số dùng chung --- */
export const DAYS: readonly string[] = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
export const DAYS_SHORT: readonly string[] = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
export const TIMES: readonly string[] = ['08:00', '10:00', '13:00', '15:00', '19:00'];

/* ⭐ XSS GUARD */
export function escHtml(str: unknown): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* --- Backward compat: v14 code gọi window.escHtml --- */
window.escHtml = escHtml;

/* --- Báo cáo health system (nếu có) --- */
window.FPCReport?.ok('01-utils.js', 'Tiện ích: $, el, debounce, fmtBytes...');
