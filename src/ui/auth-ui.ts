// src/ui/auth-ui.ts
import { handleLogin, handleRegister } from '../core/auth';

interface AuthUIOptions {
  onAuthEvent: () => void | Promise<void>;
  handleLogoutUi: () => void | Promise<void>;
}

export function setupAuthUI(opts: AuthUIOptions): void {
  const loginForm = document.getElementById('authLoginForm') as HTMLFormElement | null;
  const registerForm = document.getElementById('authRegisterForm') as HTMLFormElement | null;
  const messageEl = document.getElementById('authMessage');

  const showMsg = (text: string, type: 'error' | 'success'): void => {
    if (!messageEl) return;
    messageEl.textContent = text;
    messageEl.className = `mt-5 p-3.5 rounded-xl text-sm font-semibold auth-${type}`;
    messageEl.classList.remove('hidden');
  };

  const clearMsg = (): void => messageEl?.classList.add('hidden');

  // 1. Tab switching
  document.querySelectorAll<HTMLElement>('[data-auth-tab]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement;
      const tab = target.dataset.authTab;
      document.querySelectorAll('[data-auth-tab]').forEach((b) => b.classList.remove('active'));
      target.classList.add('active');
      if (tab === 'login') {
        loginForm?.classList.remove('hidden');
        registerForm?.classList.add('hidden');
      } else {
        loginForm?.classList.add('hidden');
        registerForm?.classList.remove('hidden');
      }
      clearMsg();
    });
  });

  // 2. Toggle password
  document.querySelectorAll<HTMLElement>('[data-toggle-pw]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement;
      const inputId = target.dataset.togglePw;
      if (!inputId) return;
      const input = document.getElementById(inputId) as HTMLInputElement | null;
      if (!input) return;
      const isPw = input.type === 'password';
      input.type = isPw ? 'text' : 'password';
      const icon = target.querySelector('i');
      icon?.classList.toggle('fa-eye', !isPw);
      icon?.classList.toggle('fa-eye-slash', isPw);
    });
  });

  // 3. Login submit
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = (document.getElementById('authLoginEmail') as HTMLInputElement | null)?.value ?? '';
    const password = (document.getElementById('authLoginPassword') as HTMLInputElement | null)?.value ?? '';

    const submitBtn = loginForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    submitBtn?.setAttribute('disabled', 'true');
    showMsg('Đang đăng nhập...', 'success');

    try {
      const result = await handleLogin(email, password);
      showMsg(result.message, 'success');
      await opts.onAuthEvent();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Đăng nhập thất bại';
      showMsg(msg, 'error');
    } finally {
      submitBtn?.removeAttribute('disabled');
    }
  });

  // 4. Register submit
  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = (document.getElementById('authRegName') as HTMLInputElement | null)?.value ?? '';
    const email = (document.getElementById('authRegEmail') as HTMLInputElement | null)?.value ?? '';
    const password = (document.getElementById('authRegPassword') as HTMLInputElement | null)?.value ?? '';
    const confirm = (document.getElementById('authRegConfirm') as HTMLInputElement | null)?.value ?? '';

    if (password !== confirm) {
      showMsg('Mật khẩu xác nhận không khớp', 'error');
      return;
    }

    const submitBtn = registerForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    submitBtn?.setAttribute('disabled', 'true');
    showMsg('Đang tạo tài khoản...', 'success');

    try {
      const res = await handleRegister(name, email, password);
      showMsg(res.message, 'success');
      await opts.onAuthEvent();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể đăng ký';
      showMsg(msg, 'error');
    } finally {
      submitBtn?.removeAttribute('disabled');
    }
  });

  // 5. Logout từ pending/rejected
  document
    .getElementById('pendingLogoutBtn')
    ?.addEventListener('click', () => void opts.handleLogoutUi());
  document
    .getElementById('rejectedLogoutBtn')
    ?.addEventListener('click', () => void opts.handleLogoutUi());
}
