import { handleLogout } from '../../core/auth';
import { getTheme, setTheme } from '../../core/theme';
import './settings-menu.css';

export function bindSettingsMenu(trigger: HTMLButtonElement, openAccount: () => void): void {
  const menu = document.createElement('div');
  menu.id = 'account-settings-menu';
  menu.className = 'account-settings-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-label', 'Cài đặt tài khoản');
  menu.innerHTML = `
    <button type="button" class="settings-menu-account"><i class="fa-regular fa-user" aria-hidden="true"></i><span>Thông tin tài khoản</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
    <div class="settings-menu-appearance"><div><i class="fa-regular fa-moon" aria-hidden="true"></i><span>Giao diện</span></div><div class="settings-theme-options" role="group" aria-label="Giao diện sáng tối"><button type="button" data-settings-theme="light">☀ Sáng</button><button type="button" data-settings-theme="dark">☾ Tối</button></div></div>
    <button type="button" class="settings-menu-logout"><i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i><span>Đăng xuất</span></button>`;
  document.body.append(menu);
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-controls', menu.id);
  trigger.setAttribute('aria-expanded', 'false');
  const close = (restoreFocus = false): void => {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  };
  const syncTheme = (): void => {
    menu.querySelectorAll<HTMLButtonElement>('[data-settings-theme]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.settingsTheme === getTheme()));
    });
  };
  trigger.addEventListener('click', () => {
    if (!menu.hidden) return close();
    syncTheme();
    menu.hidden = false;
    const rect = trigger.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, rect.top - menu.offsetHeight - 10)}px`;
    trigger.setAttribute('aria-expanded', 'true');
    menu.querySelector<HTMLButtonElement>('button')?.focus();
  });
  menu.querySelector('.settings-menu-account')?.addEventListener('click', () => {
    close(true);
    openAccount();
  });
  menu.querySelectorAll<HTMLButtonElement>('[data-settings-theme]').forEach((button) => {
    button.addEventListener('click', () => {
      setTheme(button.dataset.settingsTheme === 'dark' ? 'dark' : 'light');
      syncTheme();
    });
  });
  menu.querySelector('.settings-menu-logout')?.addEventListener('click', () => {
    close();
    void handleLogout();
  });
  document.addEventListener('pointerdown', (event) => {
    if (event.target instanceof Node && !menu.contains(event.target) && !trigger.contains(event.target)) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) close(true);
  });
  document.addEventListener('focusin', (event) => {
    if (event.target instanceof Node && !menu.contains(event.target) && !trigger.contains(event.target)) close();
  });
  window.addEventListener('resize', () => close());
}
