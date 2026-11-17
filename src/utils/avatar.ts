/* ============================================================
   FPC LAB · src/utils/avatar.ts
   Helper xử lý hiển thị Avatar toàn cục
   ============================================================ */

import { escHtml } from './index';
import { Auth } from '../core/auth';

interface AvatarData {
  name: string;
  url?: string | null;
}

export function getAvatarHtml(data: AvatarData, extraClasses = '', imgClass = 'object-cover'): string {
  const baseClass = `w-9 h-9 rounded-xl flex items-center justify-center font-black text-white text-sm overflow-hidden shrink-0 ${extraClasses}`;
  
  if (data.url) {
    return `<div class="${baseClass}"><img src="${escHtml(data.url)}" alt="${escHtml(data.name)}" class="w-full h-full ${imgClass}"></div>`;
  }
  
  const initial = (data.name || '?').charAt(0).toUpperCase();
  return `<div class="${baseClass} bg-gradient-to-tr from-violet-600 to-pink-600">${escHtml(initial)}</div>`;
}

export function refreshAvatars(): void {
  const user = Auth.user;
  const profile = Auth.profile;
  
  const userName = profile?.display_name || user?.email?.split('@')[0] || 'User';
  const userAvatarUrl = profile?.avatar_url;

  document.querySelectorAll<HTMLElement>('[data-avatar="user"]').forEach((el) => {
    el.innerHTML = getAvatarHtml({ name: userName, url: userAvatarUrl });
  });

  const clubSettings = Auth.clubSettings;
  if (clubSettings) {
    const defaultLogo = '/logo-clb.png';
    const logoUrl = clubSettings.logo_url || defaultLogo;
    document.querySelectorAll<HTMLElement>('[data-avatar="club"]').forEach((el) => {
      // Tăng kích thước hiển thị logo một chút cho rõ nét, dùng object-contain để không bị cắt
      el.innerHTML = getAvatarHtml({ name: clubSettings.club_name, url: logoUrl }, 'w-10 h-10 !bg-transparent', 'object-contain');
    });
  }
}
