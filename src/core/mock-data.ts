/* ============================================================
   FPC LAB · src/core/mock-data.ts
   Giả lập dữ liệu Lịch & Dự án để test giao diện
   ============================================================ */

import { $, el, DAYS_SHORT } from '../utils';

export function renderMockData(): void {
  // 1. Vẽ Lịch (Timeline Grid)
  const grid = $('#timelineGrid');
  if (grid && grid.children.length === 0) {
    const wrap = document.createElement('div');
    wrap.className = 'grid grid-cols-7 border-b border-white/10';
    
    // Vẽ header các thứ
    DAYS_SHORT.forEach(day => {
      wrap.append(el('div', { 
        class: 'p-3 text-center text-xs font-bold text-slate-400 border-r border-white/10',
        text: day
      }));
    });

    // Vẽ các ô lịch trống
    for (let i = 0; i < 28; i++) {
      const cell = el('div', { class: 'h-24 border-r border-b border-white/10 p-2 hover:bg-white/5 transition cursor-pointer' });
      if (i % 4 === 0) {
        cell.append(el('div', { class: 'bg-pink-500/20 text-pink-300 text-[10px] p-1 rounded mb-1 border border-pink-500/30', text: 'Sự kiện Demo' }));
      }
      wrap.append(cell);
    }
    grid.append(wrap);
  }

  // 2. Vẽ Dự án (Project List)
  const list = $('#projectList');
  if (list && list.children.length === 0) {
    ['FPC HUB v15', 'Thiết kế Poster', 'Video Tiktok'].forEach(proj => {
      const card = el('div', { class: 'glass-card p-5 rounded-2xl cursor-pointer hover:border-pink-500/50 transition' });
      card.innerHTML = `
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-white font-bold">
            ${proj.charAt(0)}
          </div>
          <h3 class="font-bold text-white text-lg">${proj}</h3>
        </div>
        <p class="text-xs text-slate-400">Cập nhật lần cuối: Hôm nay</p>
      `;
      list.append(card);
    });
  }

  // 3. Vẽ Admin (Dữ liệu ảo)
  const adminList = $('#adminUserList');
  if (adminList && adminList.children.length === 0) {
    const user = el('div', { class: 'glass-soft p-4 rounded-xl flex items-center justify-between' });
    user.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-white">A</div>
        <div>
          <div class="text-sm font-bold text-white">Nguyễn Văn A</div>
          <div class="text-xs text-slate-400">Chờ duyệt</div>
        </div>
      </div>
      <button class="px-3 py-1 bg-emerald-500 text-white text-xs rounded-lg">Duyệt</button>
    `;
    adminList.append(user);
  }
}
