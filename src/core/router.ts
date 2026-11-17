import { getFeature, getAllRoutes, type CleanupFn, type Feature } from './registry';
import type { AppServices } from './services';

let currentCleanup: CleanupFn | null = null;
let currentRoute: string | null = null;
let mountToken = 0;
let services: AppServices | null = null;
let container: HTMLElement | null = null;
let notFoundHandler: ((path: string) => void) | null = null;
let activeAbortController: AbortController | null = null;

function parseHash(): string {
  const hash = window.location.hash.replace(/^#/, '');
  return hash || '/';
}

async function applyCleanup(fn: void | CleanupFn): Promise<void> {
  if (typeof fn === 'function') {
    try {
      fn();
    } catch (err) {
      console.warn('[router] cleanup lỗi:', err);
    }
  }
}

function syncSidebarActive(path: string): void {
  const normalized = path.replace(/^\//, '') || 'timeline';
  document.querySelectorAll<HTMLElement>('[data-nav]').forEach((el) => {
    const navVal = el.dataset.nav;
    const isActive = navVal === normalized || (navVal === 'timeline' && normalized === '');
    el.classList.toggle('nav-active', isActive);
  });
}

async function renderRoute(path: string): Promise<void> {
  if (!services || !container) {
    console.warn('[router] chưa init');
    return;
  }

  if (activeAbortController) {
    activeAbortController.abort();
  }
  activeAbortController = new AbortController();
  const currentSignal = activeAbortController.signal;

  const token = ++mountToken;

  if (currentCleanup) {
    await applyCleanup(currentCleanup);
    currentCleanup = null;
  }

  currentRoute = path;
  syncSidebarActive(path);

  const feature: Feature | undefined = getFeature(path);

  if (!feature) {
    if (notFoundHandler) notFoundHandler(path);
    else {
      ['timelineSection', 'projectsSection', 'departmentsSection', 'adminSection', 'tasksSection'].forEach((id) => {
        document.getElementById(id)?.classList.add('hidden');
      });
      console.warn('[router] Không tìm thấy route:', path);
    }
    return;
  }

  try {
    const result = await feature.mount(container, services, currentSignal);

    if (token !== mountToken || currentSignal.aborted) {
      await applyCleanup(result);
      return;
    }

    if (typeof result === 'function') {
      currentCleanup = result;
    }
  } catch (err) {
    if (currentSignal.aborted) return;
    console.error(`[router] mount lỗi tại ${path}:`, err);
    if (token === mountToken) {
      services.notify('Lỗi tải giao diện. Vui lòng tải lại trang.', 'error');
    }
  }
}

export function navigate(path: string): void {
  const target = path.startsWith('/') ? path : `/${path}`;
  if (parseHash() === target) {
    void renderRoute(target);
    return;
  }
  window.location.hash = target;
}

export function initRouter(opts: {
  container: HTMLElement;
  services: AppServices;
  onNotFound?: (path: string) => void;
}): void {
  container = opts.container;
  services = opts.services;
  notFoundHandler = opts.onNotFound ?? null;

  window.addEventListener('hashchange', () => {
    void renderRoute(parseHash());
  });

  void renderRoute(parseHash());
}

export function getCurrentRoute(): string | null {
  return currentRoute;
}

export function listRoutes(): string[] {
  return getAllRoutes();
}
