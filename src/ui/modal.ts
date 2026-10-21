/* ============================================================
   FPC LAB · src/ui/modal.ts
   Port `Modal` từ v14 `03-ui.js` — stack, open, close, trap.
   ============================================================ */

import { $$ } from '../utils';

interface ModalEntry {
  id: string;
  trigger: HTMLElement | null;
}

export type ModalBuildFn = (content: HTMLElement) => void;

const TRAP_SELECTOR =
  'button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])';

function getRoot(): HTMLElement | null {
  return document.getElementById('modalRoot');
}

export const Modal = {
  stack: [] as ModalEntry[],

  open(id: string, trigger: HTMLElement | null, buildFn: ModalBuildFn): void {
    document.getElementById(id)?.remove();

    const root = getRoot();
    if (!root) {
      console.warn('[Modal] #modalRoot không tồn tại — không mở modal');
      return;
    }

    const wrap = document.createElement('div');
    wrap.id = id;
    wrap.className = 'fixed inset-0 z-[120] flex items-center justify-center p-4';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', `${id}-title`);
    wrap.tabIndex = -1;

    const backdrop = document.createElement('div');
    backdrop.className = 'absolute inset-0 bg-black/70 backdrop-blur-sm backdrop-enter';

    const content = document.createElement('div');
    content.className =
      'modal-content relative glass rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col modal-enter shadow-2xl overflow-hidden';

    buildFn(content);
    wrap.append(backdrop, content);
    root.append(wrap);

    Modal.stack.push({ id, trigger });
    backdrop.addEventListener('click', () => Modal.close(id));

    requestAnimationFrame(() => {
      const first = content.querySelector<HTMLElement>(TRAP_SELECTOR);
      (first ?? content).focus({ preventScroll: true });
    });
  },

  close(id: string): void {
    const wrap = document.getElementById(id);
    if (!wrap) return;

    const c = wrap.lastElementChild;
    const b = wrap.firstElementChild;
    if (c) c.classList.replace('modal-enter', 'modal-leave');
    if (b) b.classList.replace('backdrop-enter', 'backdrop-leave');

    window.setTimeout(() => wrap.remove(), 220);

    const idx = Modal.stack.findIndex((x) => x.id === id);
    if (idx >= 0) {
      const removed = Modal.stack.splice(idx, 1);
      const entry = removed[0];
      if (entry && entry.trigger && entry.trigger.isConnected) {
        entry.trigger.focus({ preventScroll: true });
      }
    }
  },

  closeTop(): void {
    const top = Modal.stack.at(-1);
    if (top) Modal.close(top.id);
  },

  trap(e: KeyboardEvent): void {
    if (e.key === 'Escape' && Modal.stack.length) {
      e.preventDefault();
      Modal.closeTop();
      return;
    }
    if (e.key !== 'Tab' || !Modal.stack.length) return;

    const top = Modal.stack.at(-1);
    if (!top) return;
    const root = document.getElementById(top.id);
    if (!root) return;

    const list = $$<HTMLElement>(TRAP_SELECTOR, root).filter(
      (x) => x.offsetParent !== null
    );
    if (list.length === 0) return;

    const first = list[0];
    const last = list[list.length - 1];
    if (!first || !last) return;

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  },
};
