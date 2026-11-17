// src/main.ts
import { setupAuthUI } from './ui/auth-ui';
import { initAuthListener, handleLogout, Auth } from './core/auth';
import { Toast } from './ui/toast';
import { Modal } from './ui/modal';
import { initChatFeature, destroyChatFeature } from './features/chat';
import { startClock } from './core/ui-interactions';
import { initRouter } from './core/router';
import { registerAllFeatures } from './app/routes';
import { createAppServices } from './app/create-services';
import { initTheme } from './core/theme';
import { canManageClub } from './core/access';
import './app/workspace.css';
import './app/minimal-theme.css';
import { initWorkspaceShell } from './app/workspace-shell';
import './features/settings/profile-settings';

// Apply theme sớm nhất có thể để tránh flash sai theme
initTheme();

window.Toast = Toast;
window.Modal = Modal;

window.addEventListener('error', (e) => {
  console.error('[FATAL]', e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[FATAL ASYNC]', e.reason);
});

const PAGE_IDS = ['authLoading', 'authPage', 'mainAppContainer', 'pendingPage', 'rejectedPage'] as const;

function byId<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function showOnly(targetId: string): void {
  const target = byId(targetId);
  if (!target) {
    if (targetId !== 'authPage') showOnly('authPage');
    return;
  }
  for (const id of PAGE_IDS) {
    if (id === targetId) target.classList.remove('hidden');
    else byId(id)?.classList.add('hidden');
  }
  if (targetId !== 'authLoading') byId('authLoading')?.remove();
}

type CalendarModule = typeof import('./features/calendar');
let calendarModulePromise: Promise<CalendarModule> | null = null;

function loadCalendarModule(): Promise<CalendarModule> {
  if (!calendarModulePromise) {
    calendarModulePromise = import('./features/calendar').catch((err) => {
      calendarModulePromise = null;
      console.error('[main] ❌ Calendar module FAILED to load:', err);
      throw err;
    });
  }
  return calendarModulePromise;
}

async function destroyCalendarSafe(): Promise<void> {
  try {
    const m = await loadCalendarModule();
    m.destroyCalendarFeature();
  } catch { /* silent */ }
}

async function bindNavigation(): Promise<void> {
  if (document.body.dataset.navBound === '1') return;
  document.body.dataset.navBound = '1';

  document.body.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    if (target.closest('[data-action="open-sidebar"]')) {
      document.getElementById('sidebar')?.classList.remove('-translate-x-full');
      document.getElementById('mobileOverlay')?.classList.remove('hidden');
    }
    if (target.closest('[data-action="close-sidebar"]')) {
      document.getElementById('sidebar')?.classList.add('-translate-x-full');
      document.getElementById('mobileOverlay')?.classList.add('hidden');
    }

    const navBtn = target.closest('[data-nav]') as HTMLElement | null;
    if (navBtn && navBtn.dataset.nav) {
      const view = navBtn.dataset.nav;
      const pathMap: Record<string, string> = {
        timeline: '/',
        projects: '/projects',
        departments: '/departments',
        admin: '/admin',
        tasks: '/tasks',
        files: '/files',
      };
      const path = pathMap[view] ?? '/';
      window.location.hash = path;
    }
  });
}

export async function routeFromAuth(): Promise<void> {
  const user = Auth.user;

  if (!user) {
    destroyChatFeature();
    void destroyCalendarSafe();
    showOnly('authPage');
    return;
  }

  const status = Auth.profile?.approval_status;

  if (status === 'active') {
    initWorkspaceShell();
    const management = canManageClub(Auth.profile);
    document.querySelectorAll<HTMLElement>('[data-nav="departments"]').forEach(button => {
      button.classList.toggle('hidden', !management);
      const label = button.querySelector('span');
      if (label) label.textContent = 'Tổ chức & quản trị';
    });
    document.getElementById('navAdminBtn')?.classList.add('hidden');
    if (!management && ['/admin','/departments'].includes(window.location.hash.replace(/^#/, ''))) {
      window.location.hash = '/';
    }
    showOnly('mainAppContainer');

    startClock();
    void bindNavigation();

    if (document.body.dataset.routerReady !== '1') {
      document.body.dataset.routerReady = '1';
      registerAllFeatures();
      const services = createAppServices();
      const container = document.getElementById('mainScroll');
      if (container) {
        initRouter({ container, services });
      } else {
        console.error('[main] Không tìm thấy #mainScroll');
      }
    }

    void initChatFeature();
    return;
  }

  if (status === 'pending') {
    void destroyCalendarSafe();
    const emailEl = byId('pendingEmail');
    if (emailEl && user.email) emailEl.textContent = user.email;
    showOnly('pendingPage');
    return;
  }

  if (status === 'rejected') {
    void destroyCalendarSafe();
    showOnly('rejectedPage');
    return;
  }

  void destroyCalendarSafe();
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
  spinner.className = 'w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin';
  const text = document.createElement('p');
  text.className = 'text-sm text-slate-400';
  text.textContent = 'Đang kiểm tra phiên đăng nhập...';
  wrap.append(spinner, text);
  root.appendChild(wrap);
  document.body.appendChild(root);
}

async function handleLogoutAndRoute(): Promise<void> {
  destroyChatFeature();
  await destroyCalendarSafe();
  await handleLogout();
  await routeFromAuth();
}

function bootstrap(): void {
  ensureLoadingEl();

  const fallbackTimer = window.setTimeout(() => {
    if (document.getElementById('authLoading')) {
      console.warn('[main] Auth fallback timeout — hiển thị trang login');
      showOnly('authPage');
    }
  }, 8000);

  try {
    initAuthListener(() => {
      window.clearTimeout(fallbackTimer);
      void routeFromAuth();
    });
    setupAuthUI({
      onAuthEvent: () => {
        window.clearTimeout(fallbackTimer);
        void routeFromAuth();
      },
      handleLogoutUi: handleLogoutAndRoute,
    });
  } catch (err) {
    console.error('[main] ❌ Bootstrap FAILED:', err);
    window.clearTimeout(fallbackTimer);
    showOnly('authPage');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
