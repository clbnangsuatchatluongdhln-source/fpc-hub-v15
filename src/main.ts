// src/main.ts
import { setupAuthUI } from './ui/auth-ui';
import { initAuthListener, handleLogout, Auth } from './core/auth';
import { Toast } from './ui/toast';
import { Modal } from './ui/modal';
import { initChatFeature, destroyChatFeature } from './features/chat';

// LEGACY BRIDGE — Giai đoạn chuyển tiếp v14 → v15.
window.Toast = Toast;
window.Modal = Modal;

const PAGE_IDS = [
  'authLoading',
  'authPage',
  'mainAppContainer',
  'pendingPage',
  'rejectedPage',
] as const;

function byId<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function showOnly(targetId: string): void {
  const target = byId(targetId);
  if (!target) {
    if (targetId !== 'authPage') {
      console.warn(`[main] #${targetId} không tồn tại → fallback #authPage`);
      showOnly('authPage');
    }
    return;
  }
  for (const id of PAGE_IDS) {
    if (id === targetId) target.classList.remove('hidden');
    else byId(id)?.classList.add('hidden');
  }
  if (targetId !== 'authLoading') byId('authLoading')?.remove();
}

export async function routeFromAuth(): Promise<void> {
  const user = Auth.user;
  if (!user) {
    destroyChatFeature();
    showOnly('authPage');
    return;
  }

  const status = Auth.profile?.approval_status;
  if (status === 'active') {
    showOnly('mainAppContainer');
    /* Khởi tạo chat feature — idempotent, an toàn khi gọi lại. */
    void initChatFeature();
    return;
  }
  if (status === 'pending') {
    const emailEl = byId('pendingEmail');
    if (emailEl && user.email) emailEl.textContent = user.email;
    showOnly('pendingPage');
    return;
  }
  if (status === 'rejected') {
    showOnly('rejectedPage');
    return;
  }

  showOnly('authPage');
}

function ensureLoadingEl(): void {
  if (byId('authLoading')) return;
  const root = document.createElement('div');
  root.id = 'authLoading';
  root.className = 'fixed inset-0 z-50 flex items-center justify-center bg-slate-950';
  const wrap = document.createElement('div');
  wrap.className = 'flex flex-col items-center gap-4';
  const spinner = document.createElement('div');
  spinner.className =
    'w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin';
  const text = document.createElement('p');
  text.className = 'text-sm text-slate-400';
  text.textContent = 'Đang kiểm tra phiên đăng nhập...';
  wrap.append(spinner, text);
  root.appendChild(wrap);
  document.body.appendChild(root);
}

async function handleLogoutAndRoute(): Promise<void> {
  destroyChatFeature();
  await handleLogout();
  await routeFromAuth();
}

document.addEventListener('DOMContentLoaded', () => {
  ensureLoadingEl();
  initAuthListener(() => routeFromAuth());
  setupAuthUI({
    onAuthEvent: routeFromAuth,
    handleLogoutUi: handleLogoutAndRoute,
  });
});
