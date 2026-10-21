/* ============================================================
   FPC LAB · src/features/chat/group-settings.ts
   UI Component: Cài đặt Nhóm chat (Avatar, Tên nhóm)
   ============================================================ */

import { Modal } from '../../ui/modal';
import { Toast } from '../../ui/toast';
import { el, escHtml } from '../../utils';
import { getAvatarHtml } from '../../utils/avatar';
import { updateGroupInfo } from './chat-service';

// Khe cắm ImageKit: Thay thế bằng hàm upload thật của bạn
type UploadFn = (file: File) => Promise<string>;
const uploadImage: UploadFn = async (file) => {
  console.log('Đang upload file:', file.name);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return 'https://ik.imagekit.io/demo/img/group_placeholder.jpg'; 
};

export function openGroupSettings(
  groupId: string,
  groupName: string,
  currentAvatar: string | null,
  onSuccess?: (newName: string, newAvatar: string) => void
): void {
  const modalId = `group-settings-${groupId}`;

  Modal.open(modalId, null, (content) => {
    const header = el('div', { class: 'p-5 border-b border-white/10 flex items-center justify-between' });
    header.innerHTML = `
      <h2 class="text-lg font-black text-white flex items-center gap-2">
        <i class="fa-solid fa-users-gear text-cyan-400"></i> Cài đặt Nhóm
      </h2>
      <button class="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition" onclick="window.Modal.close('${modalId}')">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;

    const body = el('div', { class: 'p-6 space-y-5' });
    const groupSection = el('div', { class: 'flex items-center gap-5' });
    
    // Khối Avatar Nhóm
    const avatarWrap = el('div', { class: 'relative group cursor-pointer shrink-0' });
    avatarWrap.innerHTML = getAvatarHtml({ name: groupName, url: currentAvatar }, 'w-20 h-20 text-2xl rounded-2xl bg-cyan-600');
    
    const overlay = el('div', {
      class: 'absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity',
    });
    overlay.innerHTML = '<i class="fa-solid fa-camera text-white text-xl"></i>';
    avatarWrap.appendChild(overlay);

    const fileInput = el('input', { type: 'file', accept: 'image/*', class: 'hidden' });
    let newAvatarUrl = currentAvatar;

    // Xử lý upload Avatar nhóm
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;

      try {
        Toast.show('Đang tải ảnh nhóm lên...', { type: 'info' });
        newAvatarUrl = await uploadImage(file);
        
        avatarWrap.innerHTML = getAvatarHtml({ name: groupName, url: newAvatarUrl }, 'w-20 h-20 text-2xl rounded-2xl');
        avatarWrap.appendChild(overlay);
        Toast.show('Đã tải ảnh lên, bấm Lưu để hoàn tất!', { type: 'success' });
      } catch (err: unknown) {
        Toast.show(err instanceof Error ? err.message : 'Lỗi upload ảnh', { type: 'error' });
      }
    });

    avatarWrap.addEventListener('click', () => fileInput.click());

    // Khối nhập tên nhóm
    const formWrap = el('div', { class: 'flex-1 space-y-3' });
    formWrap.innerHTML = `
      <div>
        <label class="block text-xs font-bold text-slate-400 mb-1.5">Tên Nhóm</label>
        <input type="text" id="input-group-name" class="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/50 transition" value="${escHtml(groupName)}">
      </div>
    `;
    const nameInput = formWrap.querySelector<HTMLInputElement>('#input-group-name');

    const saveBtn = el('button', { 
      class: 'w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:opacity-95 text-white px-5 py-3 rounded-xl text-sm font-bold shadow-lg transition-transform active:scale-95 mt-2',
      text: 'Lưu thay đổi'
    });

    saveBtn.addEventListener('click', async () => {
      const finalName = nameInput?.value.trim();
      if (!finalName) return Toast.show('Tên nhóm không được để trống', { type: 'warn' });

      try {
        saveBtn.setAttribute('disabled', 'true');
        
        const success = await updateGroupInfo(groupId, finalName, newAvatarUrl);
        if (!success) throw new Error('Không thể lưu vào cơ sở dữ liệu');

        Toast.show('Đã lưu thông tin nhóm!', { type: 'success' });
        Modal.close(modalId);
        
        if (onSuccess && newAvatarUrl) {
          onSuccess(finalName, newAvatarUrl);
        }
      } catch (err: unknown) {
        Toast.show(err instanceof Error ? err.message : 'Lỗi cập nhật nhóm', { type: 'error' });
      } finally {
        saveBtn.removeAttribute('disabled');
      }
    });

    groupSection.append(avatarWrap, formWrap, fileInput);
    body.append(groupSection, saveBtn);
    content.append(header, body);
  });
}
