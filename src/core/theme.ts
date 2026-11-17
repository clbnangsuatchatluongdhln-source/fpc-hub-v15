type Theme = 'dark' | 'light';

const THEME_KEY = 'fpc-lab-theme';
const THEME_VALUES: readonly Theme[] = ['dark', 'light'];

let current: Theme = 'light';
let initialized = false;

function isTheme(v: unknown): v is Theme {
  return typeof v === 'string' && (THEME_VALUES as readonly string[]).includes(v);
}

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  current = theme;
  updateToggleUI();
}

function getStored(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return isTheme(v) ? v : 'light';
  } catch {
    return 'light';
  }
}

function save(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore
  }
}

function updateToggleUI(): void {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  const icon = btn.querySelector('i');
  const label = btn.querySelector('span');
  if (current === 'light') {
    if (icon) icon.className = 'fa-solid fa-moon text-xs';
    if (label) label.textContent = 'Tối';
    btn.title = 'Chuyển sang theme tối';
  } else {
    if (icon) icon.className = 'fa-solid fa-sun text-xs';
    if (label) label.textContent = 'Sáng';
    btn.title = 'Chuyển sang theme sáng';
  }
}

export function setTheme(theme: Theme): void {
  save(theme);
  applyTheme(theme);
}

export function toggleTheme(): void {
  setTheme(current === 'dark' ? 'light' : 'dark');
}

export function getTheme(): Theme {
  return current;
}

export function initTheme(): void {
  if (initialized) return;
  initialized = true;

  applyTheme(getStored());

  // Dùng event delegation để bắt click kể cả khi nút được render động trong Modal
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('#themeToggleBtn');
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      toggleTheme();
    }
  });
}
