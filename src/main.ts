// src/main.ts
import { setupAuthUI } from './ui/auth-ui';
import { initAuthListener, handleLogout, Auth } from './core/auth';
import { Toast } from './ui/toast';
import { Modal } from './ui/modal';
import { initChatFeature, destroyChatFeature } from './features/chat';
import { startClock } from './core/ui-interactions'; // Chỉ dùng để chạy đồng hồ
import './features/settings/profile-settings'; 

window.Toast = Toast;
window.Modal = Modal;

/* ─── Global error boundary ─────────────────────────────── */
window.addEventListener('error', (e) => {
  console.error('[FATAL]', e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[FATAL ASYNC]', e.reason);
});

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
    if (targetId !== 'authPage') showOnly('authPage');
    return;
  }
  for (const id of PAGE_IDS) {
    if (id === targetId) target.classList.remove('hidden');
    else byId(id)?.classList.add('hidden');
  }
  if (targetId !== 'authLoading') byId('authLoading')?.remove();
}

/* ─── Calendar lazy-load helpers ────────────────────────── */

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

async function initCalendarSafe(): Promise<void> {
  try {
    const m = await loadCalendarModule();
    await m.initCalendarFeature({
      onQuickUpload: async (eventId) => {
        Toast.show(`Đã gọi Quick Upload cho sự kiện: ${eventId}`, { type: 'success' });
      },
      onItemClick: (item) => {
        console.log('[calendar] item click:', item.type, item.id);
      },
    });
    
    // Đảm bảo section hiển thị
    const timeline = document.getElementById('timelineSection');
    if (timeline) timeline.classList.remove('hidden');
    
    console.log('[main] ✅ Calendar init OK');
  } catch (err) {
    console.error('[main] Calendar init failed:', err);
    Toast.show('Module Lịch không tải được — Xem Console (F12)', { type: 'error', timeout: 6000 });
  }
}

async function destroyCalendarSafe(): Promise<void> {
  try {
    const m = await loadCalendarModule();
    m.destroyCalendarFeature();
  } catch { /* silent */ }
}

/* ─── Navigation Binding ────────────────────────────────── */
// Hàm này kết nối nút bấm Sidebar HTML với hàm navigate() của Calendar
async function bindNavigation(): Promise<void> {
  if (document.body.dataset.navBound === '1') return;
  document.body.dataset.navBound = '1';

  document.body.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    
    // Xử lý đóng/mở sidebar trên mobile
    if (target.closest('[data-action="open-sidebar"]')) {
      document.getElementById('sidebar')?.classList.remove('-translate-x-full');
      document.getElementById('mobileOverlay')?.classList.remove('hidden');
    }
    if (target.closest('[data-action="close-sidebar"]')) {
      document.getElementById('sidebar')?.classList.add('-translate-x-full');
      document.getElementById('mobileOverlay')?.classList.add('hidden');
    }

    // Xử lý chuyển Tab (Gọi navigate của Calendar)
    const navBtn = target.closest('[data-nav]') as HTMLElement | null;
    if (navBtn && navBtn.dataset.nav) {
      try {
        const m = await loadCalendarModule();
        m.navigate(navBtn.dataset.nav); // Gọi hàm navigate của bạn
      } catch (err) {
        console.warn('Chưa load được module Calendar:', err);
      }
    }
  });
}

/* ─── Route ────────────────────────────────────────────── */

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
    showOnly('mainAppContainer');
    
    // Kích hoạt đồng hồ và binding
    startClock();
    void bindNavigation();

    void initChatFeature();
    void initCalendarSafe();
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

/* ─── Bootstrap ────────────────────────────────────────── */

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

document.addEventListener('DOMContentLoaded', () => {
  ensureLoadingEl();
  try {
    initAuthListener(() => routeFromAuth());
    setupAuthUI({
      onAuthEvent: routeFromAuth,
      handleLogoutUi: handleLogoutAndRoute,
    });
  } catch (err) {
    console.error('[main] ❌ Bootstrap FAILED:', err);
    showOnly('authPage');
  }
});
