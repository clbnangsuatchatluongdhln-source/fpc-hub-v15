// src/ui/auth-ui.ts
import { handleLogin, handleRegister, Auth } from '../core/auth';

export function setupAuthUI() {
  const loginForm = document.getElementById('authLoginForm') as HTMLFormElement;
  const registerForm = document.getElementById('authRegisterForm') as HTMLFormElement;
  const messageEl = document.getElementById('authMessage');
  const authPage = document.getElementById('authPage');
  
  // Đã sửa: Lấy đúng ID của Main App container từ file index.html mới
  const mainApp = document.getElementById('mainAppContainer') as HTMLElement;

  // Hàm phụ trợ hiển thị thông báo lỗi/thành công
  const showMsg = (text: string, type: 'error' | 'success') => {
    if (!messageEl) return;
    messageEl.textContent = text;
    messageEl.className = `mt-5 p-3.5 rounded-xl text-sm font-semibold auth-${type}`;
    messageEl.classList.remove('hidden');
  };

  // 1. Chuyển đổi Tab Đăng nhập / Đăng ký
  document.querySelectorAll('[data-auth-tab]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement;
      const tab = target.dataset.authTab;
      
      document.querySelectorAll('[data-auth-tab]').forEach(b => b.classList.remove('active'));
      target.classList.add('active');

      if (tab === 'login') {
        loginForm?.classList.remove('hidden');
        registerForm?.classList.add('hidden');
      } else {
        loginForm?.classList.add('hidden');
        registerForm?.classList.remove('hidden');
      }
      messageEl?.classList.add('hidden');
    });
  });

  // 2. Hiện/Ẩn mật khẩu
  document.querySelectorAll('[data-toggle-pw]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement;
      const inputId = target.dataset.togglePw;
      const input = document.getElementById(inputId as string) as HTMLInputElement;
      if (!input) return;

      const isPw = input.type === 'password';
      input.type = isPw ? 'text' : 'password';
      
      const icon = target.querySelector('i');
      if (icon) {
        icon.classList.toggle('fa-eye', !isPw);
        icon.classList.toggle('fa-eye-slash', isPw);
      }
    });
  });

  // 3. Xử lý Đăng nhập
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = (document.getElementById('authLoginEmail') as HTMLInputElement).value;
    const password = (document.getElementById('authLoginPassword') as HTMLInputElement).value;
    
    try {
      showMsg('Đang đăng nhập...', 'success');
      const result = await handleLogin(email, password);
      
      // Xử lý chuyển trang sau khi login
      if (result?.dbStatus === 'active' || Auth.isSuperAdmin || Auth.isClubAdmin) {
        authPage?.classList.add('hidden');
        mainApp?.classList.remove('hidden');
      } else if (result?.dbStatus === 'pending') {
        authPage?.classList.add('hidden');
        document.getElementById('pendingPage')?.classList.remove('hidden');
        // Cập nhật email vào trang chờ duyệt
        const pendingEmail = document.getElementById('pendingEmail');
        if (pendingEmail) pendingEmail.textContent = email;
      } else if (result?.dbStatus === 'rejected') {
        authPage?.classList.add('hidden');
        document.getElementById('rejectedPage')?.classList.remove('hidden');
      }
    } catch (err: any) {
      showMsg(err.message, 'error');
    }
  });

  // 4. Xử lý Đăng ký
  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = (document.getElementById('authRegName') as HTMLInputElement).value;
    const email = (document.getElementById('authRegEmail') as HTMLInputElement).value;
    const password = (document.getElementById('authRegPassword') as HTMLInputElement).value;
    const confirm = (document.getElementById('authRegConfirm') as HTMLInputElement).value;

    if (password !== confirm) {
      return showMsg('Mật khẩu xác nhận không khớp', 'error');
    }

    try {
      showMsg('Đang tạo tài khoản...', 'success');
      const res = await handleRegister(name, email, password);
      showMsg(res?.message || 'Thành công', 'success');
    } catch (err: any) {
      showMsg(err.message, 'error');
    }
  });
  
  // (Tùy chọn) Xử lý đăng xuất từ các trang pending/rejected
  const handleLogoutUI = () => {
    // Xóa session và reset UI (sẽ gọi hàm handleLogout từ core/auth.ts sau này)
    window.location.reload(); 
  };
  document.getElementById('pendingLogoutBtn')?.addEventListener('click', handleLogoutUI);
  document.getElementById('rejectedLogoutBtn')?.addEventListener('click', handleLogoutUI);
}
