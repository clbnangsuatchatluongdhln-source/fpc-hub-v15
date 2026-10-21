/* ============================================================
   FPC LAB · src/core/ui-interactions.ts
   Xử lý tương tác giao diện cơ bản (Clock, Sidebar, Nav Tabs)
   ============================================================ */

import { fmtClock, fmtDate } from '../utils';

let clockInterval: number | undefined;

/** Khởi động đồng hồ góc trên bên phải */
export function startClock(): void {
  if (clockInterval) return; // Tránh tạo nhiều interval

  const clockEl = document.getElementById('clock');
  const dateEl = document.getElementById('dateLabel');
  if (!clockEl || !dateEl) return;

  const update = () => {
    const now = new Date();
    clockEl.textContent = fmtClock(now);
    dateEl.textContent = fmtDate(now);
  };

  update();
  clockInterval = window.setInterval(update, 1000);
}

/** Lắng nghe các sự kiện click giao diện toàn cục */
export function bindGlobalInteractions(): void {
  // Tránh bind nhiều lần nếu hàm này bị gọi lại
  if (document.body.dataset.globalBound === '1') return;
  document.body.dataset.globalBound = '1';

  document.body.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // 1. Xử lý Đóng/Mở Sidebar trên Mobile
    if (target.closest('[data-action="open-sidebar"]')) {
      document.getElementById('sidebar')?.classList.remove('-translate-x-full');
      document.getElementById('mobileOverlay')?.classList.remove('hidden');
    }
    if (target.closest('[data-action="close-sidebar"]')) {
      document.getElementById('sidebar')?.classList.add('-translate-x-full');
      document.getElementById('mobileOverlay')?.classList.add('hidden');
    }

    // 2. Xử lý chuyển đổi Tab (Lịch, Dự án, Tổ chức, Quản trị)
    const navBtn = target.closest('[data-nav]') as HTMLElement | null;
    if (navBtn) {
      const navId = navBtn.dataset.nav;
      if (!navId) return;

      // Cập nhật trạng thái active cho nút được bấm
      document.querySelectorAll('.nav-item').forEach((el) => {
        el.classList.remove('nav-active', 'text-white', 'bg-white/5');
        el.classList.add('text-slate-400');
      });
      navBtn.classList.remove('text-slate-400');
      navBtn.classList.add('nav-active');

      // Ẩn/Hiện các Section tương ứng
      ['timeline', 'projects', 'departments', 'admin'].forEach((id) => {
        const sec = document.getElementById(`${id}Section`);
        if (sec) {
          if (id === navId) sec.classList.remove('hidden');
          else sec.classList.add('hidden');
        }
      });

      // Cập nhật tiêu đề trên cùng (Header)
      const titleEl = document.getElementById('pageTitle');
      if (titleEl) {
        if (navId === 'timeline') titleEl.textContent = 'Lịch';
        if (navId === 'projects') titleEl.textContent = 'Dự án';
        if (navId === 'departments') titleEl.textContent = 'Tổ chức';
        if (navId === 'admin') titleEl.textContent = 'Quản trị';
      }
    }
  });
}
