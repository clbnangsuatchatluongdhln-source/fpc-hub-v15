/* ============================================================
   FPC LAB · src/features/settings/profile-settings.ts
   Xử lý Cài đặt Profile (Biệt danh, Avatar) & Câu lạc bộ (Tên, Logo)
   ============================================================ */

import { Modal } from '../../ui/modal';
import { Toast } from '../../ui/toast';
import { el, escHtml } from '../../utils';
import { getAvatarHtml, refreshAvatars } from '../../utils/avatar';
import { Auth } from '../../core/auth';
import { supabase } from '../../core/supabase';
import { bindSettingsMenu } from './settings-menu';

type UploadFn = (file: File) => Promise<string>;
const uploadImage: UploadFn = async (file) => {
  console.log('Đang upload file:', file.name);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return 'https://ik.imagekit.io/demo/img/avatar_placeholder.jpg'; 
};

export function openProfileSettings(): void {
  const user = Auth.user;
  const profile = Auth.profile;

  if (!user || !profile) {
    Toast.show('Vui lòng đăng nhập lại!', { type: 'error' });
    return;
  }

  const isAdmin = Auth.isClubAdmin || Auth.isSuperAdmin;
  const userName = profile.display_name || user.email?.split('@')[0] || 'User';

  Modal.open('profile-settings-modal', null, (content) => {
    const header = el('div', { class: 'p-5 border-b border-white/10 flex items-center justify-between' });
    header.innerHTML = `
      <h2 id="profile-settings-modal-title" class="text-lg font-black text-white flex items-center gap-2">
        <i class="fa-solid fa-user-gear text-pink-400"></i> Cài đặt
      </h2>
      <button class="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition" onclick="window.Modal.close('profile-settings-modal')">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;

    const body = el('div', { class: 'p-6 space-y-6 overflow-y-auto max-h-[70vh]' });

    // --- PHẦN 0: GIAO DIỆN ---
    const themeSection = el('div', { class: 'flex items-center justify-between p-4 rounded-xl bg-white/[.02] border border-white/[.05]' });
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    themeSection.innerHTML = `
      <div>
        <div class="text-sm font-bold text-white mb-1">Chế độ hiển thị</div>
        <div class="text-xs text-slate-500">Chuyển đổi giữa giao diện Sáng và Tối</div>
      </div>
      <button id="themeToggleBtn" type="button" class="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-sm font-bold transition">
        <i class="fa-solid ${isLight ? 'fa-moon' : 'fa-sun'} text-xs"></i>
        <span>${isLight ? 'Tối' : 'Sáng'}</span>
      </button>
    `;
    body.appendChild(themeSection);
    body.appendChild(el('div', { class: 'border-t border-white/10 my-2' }));

    // --- PHẦN 1: THÔNG TIN CÁ NHÂN ---
    const userSection = el('div', { class: 'flex items-start gap-5' });
    const avatarWrap = el('div', { class: 'relative group cursor-pointer shrink-0' });
    avatarWrap.innerHTML = getAvatarHtml({ name: userName, url: profile.avatar_url }, 'w-20 h-20 text-2xl rounded-2xl');
    
    const editOverlay = el('div', {
      class: 'absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity',
    });
    editOverlay.innerHTML = '<i class="fa-solid fa-camera text-white text-xl"></i>';
    avatarWrap.appendChild(editOverlay);

    const fileInput = el('input', { type: 'file', accept: 'image/*', class: 'hidden' });
    
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;

      try {
        Toast.show('Đang tải ảnh lên...', { type: 'info' });
        const url = await uploadImage(file);
        
        const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id);
        if (error) throw error;

        if (Auth.profile) Auth.profile.avatar_url = url;
        
        refreshAvatars();
        Toast.show('Cập nhật ảnh đại diện thành công!', { type: 'success' });
        
        avatarWrap.innerHTML = getAvatarHtml({ name: userName, url }, 'w-20 h-20 text-2xl rounded-2xl');
        avatarWrap.appendChild(editOverlay);

      } catch (err: unknown) {
        Toast.show(err instanceof Error ? err.message : 'Lỗi upload', { type: 'error' });
      }
    });

    avatarWrap.addEventListener('click', () => fileInput.click());
    
    const userForm = el('div', { class: 'flex-1 space-y-3' });
    userForm.innerHTML = `
      <div>
        <label class="block text-xs font-bold text-slate-400 mb-1.5">Biệt danh</label>
        <input type="text" id="input-user-name" class="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-pink-500/50 transition" value="${escHtml(userName)}" placeholder="Nhập biệt danh...">
      </div>
      <div>
        <label class="block text-xs font-bold text-slate-400 mb-1.5">Email</label>
        <input type="text" class="w-full bg-black/10 border border-white/5 rounded-xl px-4 py-2 text-sm text-slate-500 cursor-not-allowed" value="${escHtml(user.email || '')}" disabled>
      </div>
      <div class="flex items-center justify-between">
        <span class="inline-block px-2.5 py-1 rounded-md bg-white/10 text-[10px] font-bold text-slate-300 uppercase tracking-wider">
          ${profile.role === 'super_admin' ? 'Super Admin' : profile.role === 'admin' ? 'Admin' : 'Thành viên'}
        </span>
        <button id="btn-save-profile" class="bg-white/10 hover:bg-white/20 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition">Lưu thay đổi</button>
      </div>
    `;

    userForm.querySelector('#btn-save-profile')?.addEventListener('click', async () => {
      const newName = userForm.querySelector<HTMLInputElement>('#input-user-name')?.value.trim();
      if (!newName) return Toast.show('Biệt danh không được để trống', { type: 'warn' });

      try {
        const { error } = await supabase.from('profiles').update({ display_name: newName }).eq('id', user.id);
        if (error) throw error;

        if (Auth.profile) Auth.profile.display_name = newName;
        
        const sidebarName = document.getElementById('sidebarUserName');
        if (sidebarName) sidebarName.textContent = newName;

        refreshAvatars(); 
        Toast.show('Đã lưu biệt danh mới!', { type: 'success' });
      } catch (err: unknown) {
        Toast.show(err instanceof Error ? err.message : 'Lỗi lưu thông tin', { type: 'error' });
      }
    });

    userSection.append(avatarWrap, userForm, fileInput);
    body.appendChild(userSection);

    // --- PHẦN 2: CÀI ĐẶT CLB ---
    if (isAdmin) {
      const divider = el('div', { class: 'border-t border-white/10 my-6' });
      const clubTitle = el('h3', { class: 'text-sm font-black text-slate-400 uppercase tracking-widest mb-4', text: 'Cài đặt Câu lạc bộ' });

      const clubSection = el('div', { class: 'flex items-start gap-5' });
      
      const clubLogoWrap = el('div', { class: 'relative group cursor-pointer shrink-0' });
      const currentClub = Auth.clubSettings || { club_name: 'CLB', logo_url: null };
      clubLogoWrap.innerHTML = getAvatarHtml({ name: currentClub.club_name, url: currentClub.logo_url }, 'w-16 h-16 text-xl rounded-2xl');
      
      const clubLogoOverlay = el('div', {
        class: 'absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity',
      });
      clubLogoOverlay.innerHTML = '<i class="fa-solid fa-camera text-white text-lg"></i>';
      clubLogoWrap.appendChild(clubLogoOverlay);

      const clubFileInput = el('input', { type: 'file', accept: 'image/*', class: 'hidden' });
      
      clubFileInput.addEventListener('change', async () => {
        const file = clubFileInput.files?.[0];
        if (!file) return;

        try {
          Toast.show('Đang tải Logo CLB lên...', { type: 'info' });
          const url = await uploadImage(file);
          
          const { error } = await supabase.from('club_settings').upsert({ id: 1, logo_url: url }, { onConflict: 'id' });
          if (error) throw error;

          if (!Auth.clubSettings) Auth.clubSettings = { club_name: currentClub.club_name, logo_url: url };
          else Auth.clubSettings.logo_url = url;

          refreshAvatars();
          Toast.show('Cập nhật Logo CLB thành công!', { type: 'success' });
          
          clubLogoWrap.innerHTML = getAvatarHtml({ name: currentClub.club_name, url }, 'w-16 h-16 text-xl rounded-2xl');
          clubLogoWrap.appendChild(clubLogoOverlay);
        } catch (err: unknown) {
          Toast.show(err instanceof Error ? err.message : 'Lỗi upload', { type: 'error' });
        }
      });

      clubLogoWrap.addEventListener('click', () => clubFileInput.click());

      const clubForm = el('div', { class: 'flex-1 space-y-3' });
      const nameGroup = el('div');
      nameGroup.innerHTML = `
        <label class="block text-xs font-bold text-slate-400 mb-1.5">Tên Câu lạc bộ</label>
        <input type="text" id="input-club-name" class="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-pink-500/50 transition" placeholder="Nhập tên CLB...">
      `;
      const clubNameInput = nameGroup.querySelector<HTMLInputElement>('#input-club-name');
      
      void supabase.from('club_settings').select('*').eq('id', 1).maybeSingle().then(({ data }) => {
        if (data) {
          if (clubNameInput && data.club_name) clubNameInput.value = data.club_name;
          Auth.clubSettings = { club_name: data.club_name || 'CLB', logo_url: data.logo_url };
          refreshAvatars();
        }
      });

      const saveBtn = el('button', { 
        class: 'bg-gradient-to-r from-pink-600 to-violet-600 hover:opacity-95 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-neon-pink transition-transform active:scale-95',
        text: 'Lưu tên CLB'
      });

      saveBtn.addEventListener('click', async () => {
        const newName = clubNameInput?.value.trim();
        if (!newName) return Toast.show('Tên CLB không được để trống', { type: 'warn' });

        try {
          const { error } = await supabase.from('club_settings').upsert({ id: 1, club_name: newName }, { onConflict: 'id' });
          if (error) throw error;

          Toast.show('Đã cập nhật tên CLB', { type: 'success' });
          if (!Auth.clubSettings) Auth.clubSettings = { club_name: newName, logo_url: null };
          else Auth.clubSettings.club_name = newName;
          
          refreshAvatars();
        } catch (err: unknown) {
          Toast.show(err instanceof Error ? err.message : 'Lỗi cập nhật CLB', { type: 'error' });
        }
      });

      clubForm.append(nameGroup, saveBtn);
      clubSection.append(clubLogoWrap, clubForm, clubFileInput);
      body.append(divider, clubTitle, clubSection);
    }

    content.append(header, body);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const trigger = document.querySelector<HTMLButtonElement>('[data-action="open-settings"]');
  if (trigger) bindSettingsMenu(trigger, openProfileSettings);
});
