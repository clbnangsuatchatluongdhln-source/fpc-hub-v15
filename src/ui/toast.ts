/* ============================================================
   FPC LAB · src/ui/toast.ts
   Port `Toast` từ v14 `03-ui.js` — object export, không rewrite.
   ============================================================ */

import { el, escHtml } from '../utils';

export type ToastType = 'info' | 'success' | 'error' | 'warn';

export interface ToastAction {
  label: string;
  handler: () => void;
}

export interface ToastOptions {
  type?: ToastType;
  timeout?: number;
  action?: ToastAction | null;
}

interface ToastTone {
  bg: string;
  text: string;
  icon: string;
  border: string;
}

const TONES: Record<ToastType, ToastTone> = {
  info:    { bg: 'bg-cyan-500/15',    text: 'text-cyan-300',    icon: 'fa-circle-info',          border: 'border-cyan-500/30' },
  success: { bg: 'bg-emerald-500/15', text: 'text-emerald-300', icon: 'fa-circle-check',         border: 'border-emerald-500/30' },
  error:   { bg: 'bg-rose-500/15',    text: 'text-rose-300',    icon: 'fa-circle-exclamation',   border: 'border-rose-500/30' },
  warn:    { bg: 'bg-amber-500/15',   text: 'text-amber-300',   icon: 'fa-triangle-exclamation', border: 'border-amber-500/30' },
};

function getRegion(): HTMLElement | null {
  return document.getElementById('toastRegion');
}

function show(message: string, options: ToastOptions = {}): void {
  const { type = 'info', timeout = 3800, action = null } = options;
  const region = getRegion();
  if (!region) {
    console.warn('[Toast] #toastRegion không tồn tại — bỏ qua:', message);
    return;
  }

  const tone = TONES[type] ?? TONES.info;
  const wrap = el('div', {
    class: `toast glass rounded-2xl p-3.5 flex items-start gap-3 shadow-2xl border ${tone.border}`,
  });
  wrap.setAttribute('role', 'status');

  const icon = el('div', {
    class: `w-8 h-8 rounded-xl ${tone.bg} ${tone.text} flex items-center justify-center shrink-0 border border-white/[.06]`,
  });
  // Tone.icon là constant tin cậy, nhưng vẫn escHtml theo quy tắc XSS guard.
  icon.innerHTML = `<i class="fa-solid ${escHtml(tone.icon)} text-xs"></i>`;

  const body = el('div', { class: 'flex-1 min-w-0' });
  body.append(
    el('p', { class: 'text-sm leading-snug text-slate-100 font-medium', text: message })
  );

  if (action) {
    const btn = el('button', {
      class: `mt-2 text-xs font-black ${tone.text} hover:text-white transition`,
      text: action.label,
    });
    btn.addEventListener('click', () => {
      try {
        action.handler();
      } finally {
        dismiss();
      }
    });
    body.append(btn);
  }

  const close = el('button', {
    class:
      'w-6 h-6 rounded-md text-slate-500 hover:text-white hover:bg-white/5 shrink-0 flex items-center justify-center',
    'aria-label': 'Đóng',
  });
  // Static, không có giá trị động — không cần escHtml.
  close.innerHTML = '<i class="fa-solid fa-xmark text-xs"></i>';

  const prog = el('div', { class: 'toast-progress' });
  prog.style.animationDuration = `${timeout}ms`;

  wrap.append(icon, body, close, prog);
  region.append(wrap);

  let done = false;
  const timer = window.setTimeout(dismiss, timeout);

  close.addEventListener('click', dismiss);

  function dismiss(): void {
    if (done) return;
    done = true;
    window.clearTimeout(timer);
    wrap.classList.add('leaving');
    wrap.addEventListener('animationend', () => wrap.remove(), { once: true });
  }
}

export const Toast = { show };
