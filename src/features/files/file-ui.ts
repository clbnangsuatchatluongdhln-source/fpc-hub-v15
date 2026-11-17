import { Modal } from '@/ui/modal';
import { Toast } from '@/ui/toast';
import { el, clear, clamp, fmtBytes, uid, fileIcon, DAYS } from '@/utils';
import { Store } from '@/core/store';
import { getFileDownloadUrl } from './upload-service';
import {
  uploadFile,
  saveFileMetadata,
  deleteFileFromStorage,
  deleteFileMetadata,
  type AppFile,
} from './upload-service';

interface StoreLike {
  snapshot(): unknown;
  patch(p: Record<string, unknown>): void;
  select<T>(sel: (s: unknown) => T, cb: (v: T) => void): () => void;
}
const S = Store as unknown as StoreLike;

interface AppEventLike {
  id: string;
  day: number;
  time: string;
  label: string;
  tone: string;
  icon: string;
}

interface AppStateLike {
  events: AppEventLike[];
  files: Record<string, AppFile[]>;
}

const UPLOAD_PANEL_ID = 'uploadPanel';
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

function getUploadPanel(): HTMLElement | null {
  return document.getElementById(UPLOAD_PANEL_ID);
}

export function ensureUploadPanelVisible(): void {
  getUploadPanel()?.classList.remove('hidden');
}

export function maybeHidePanel(): void {
  const panel = getUploadPanel();
  if (panel && panel.children.length === 0) panel.classList.add('hidden');
}

function animateTo(
  setter: (v: number) => void,
  from: number,
  to: number,
  duration: number,
): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (t: number): void => {
      const k = Math.min(1, (t - start) / duration);
      setter(from + (to - from) * k);
      if (k < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

let channel: BroadcastChannel | null = null;
const TAB_ID = uid('tab');

try {
  channel = new BroadcastChannel('fpc-lab-v15');
  channel.addEventListener('message', (e: MessageEvent<{ from?: string; type?: string; payload?: unknown }>) => {
    const data = e.data;
    if (!data || data.from === TAB_ID || !data.type) return;
    handleRealtime(data.type, data.payload);
  });
} catch { /* ignore */ }

function broadcast(type: string, payload: unknown): void {
  try { channel?.postMessage({ from: TAB_ID, type, payload, at: Date.now() }); }
  catch { /* ignore */ }
}

function handleRealtime(type: string, payload: unknown): void {
  const p = payload as { name?: string; author?: string; text?: string } | undefined;
  if (type === 'file:added')        Toast.show(`Tab khác vừa thêm file "${p?.name ?? ''}"`, { type: 'info', timeout: 3000 });
  else if (type === 'file:deleted') Toast.show(`Tab khác vừa xóa "${p?.name ?? ''}"`, { type: 'warn', timeout: 3000 });
}

/* ─────────────────────────────────────────────
   PROCESS ONE FILE
   ───────────────────────────────────────────── */
async function processOneFile(file: File, eventId: string): Promise<void> {
  const meta = fileIcon(file.name);
  const panel = getUploadPanel();
  if (!panel) return;

  const row = el('div', { class: 'upload-row' }) as HTMLElement;
  const top = el('div', { class: 'flex items-center gap-3' });
  const iconBox = el('div', { class: `w-9 h-9 rounded-xl ${meta.bg} ${meta.cls} flex items-center justify-center shrink-0` });
  iconBox.appendChild(el('i', { class: `fa-solid ${meta.icon} text-sm` }));

  const info = el('div', { class: 'flex-1 min-w-0' });
  const nameEl = el('div', { class: 'text-sm font-bold text-white truncate', text: file.name });
  const statusEl = el('div', { class: 'text-[11px] text-slate-400 font-semibold', text: 'Đang xử lý…' });
  info.append(nameEl, statusEl);
  const pctEl = el('div', { class: 'text-sm font-black text-cyan-300 tabular-nums', text: '0%' });

  top.append(iconBox, info, pctEl);
  const barTrack = el('div', { class: 'upload-bar-track' });
  const barFill = el('div', { class: 'upload-bar-fill', style: 'width:0%' });
  barTrack.appendChild(barFill);
  row.append(top, barTrack);
  panel.appendChild(row);

  const setPct = (v: number): void => {
    const val = clamp(v, 0, 100);
    barFill.style.width = `${val}%`;
    pctEl.textContent = `${Math.round(val)}%`;
  };

  try {
    statusEl.textContent = 'Đang upload...';
    await animateTo(setPct, 0, 40, 400);

    // Upload (Tự động chọn ImageKit / B2 / Supabase)
    const result = await uploadFile(file, eventId, 'event');
    setPct(80);

    statusEl.textContent = 'Lưu thông tin...';
    const newFile = await saveFileMetadata(file, result, eventId, 'event');
    
    // Cập nhật Store
    const state = S.snapshot() as AppStateLike;
    const filesMap = { ...state.files };
    const arr = [...(filesMap[eventId] ?? [])];
    arr.push(newFile);
    filesMap[eventId] = arr;
    S.patch({ files: filesMap });

    setPct(100);
    statusEl.textContent = 'Đã lưu thành công';
    statusEl.className = 'text-[11px] text-emerald-300 font-bold';

    setTimeout(() => {
      row.style.transition = 'opacity .3s, transform .3s';
      row.style.opacity = '0';
      row.style.transform = 'translateX(30px)';
      setTimeout(() => { row.remove(); maybeHidePanel(); }, 300);
    }, 900);

    const evt = (S.snapshot() as AppStateLike).events.find((e) => e.id === eventId);
    const evtLabel = evt?.label ?? 'Sự kiện';
    Toast.show(`Đã tải lên "${file.name}" → ${evtLabel}`, { type: 'success', timeout: 4200 });
    broadcast('file:added', { eventId, name: file.name });

  } catch (err) {
    console.error(err);
    statusEl.textContent = `Lỗi: ${err instanceof Error ? err.message : 'không xử lý được'}`;
    statusEl.className = 'text-[11px] text-rose-300 font-bold';
    pctEl.textContent = '✕';
    pctEl.className = 'text-lg font-black text-rose-400';
    setTimeout(() => { row.remove(); maybeHidePanel(); }, 3000);
    Toast.show(`Lỗi "${file.name}": ${err instanceof Error ? err.message : 'không rõ'}`, { type: 'error' });
  }
}

export async function handleUploads(files: FileList | File[], eventId: string): Promise<void> {
  const arr = Array.from(files);
  if (!arr.length) return;

  const valid = arr.filter((f) => f.size <= MAX_FILE_SIZE);
  const skipped = arr.length - valid.length;
  if (skipped > 0) Toast.show(`${skipped} file vượt 100MB đã bị bỏ qua.`, { type: 'warn' });
  if (!valid.length) return;

  ensureUploadPanelVisible();
  for (const file of valid) {
    await processOneFile(file, eventId);
  }
}

/* ─────────────────────────────────────────────
   OPEN FILE HUB
   ───────────────────────────────────────────── */
export function openFileHub(eventId: string, trigger?: HTMLElement | null): void {
  const evt = (S.snapshot() as AppStateLike).events.find((e) => e.id === eventId);
  if (!evt) return;

  const dayLabel = DAYS[evt.day] ?? '';
  const endHour = `${String(parseInt(evt.time, 10) + 2).padStart(2, '0')}:00`;

  Modal.open('fileHubModal', trigger ?? null, (content: HTMLElement) => {
    const head = el('div', { class: 'shrink-0 border-b border-white/[.06] bg-white/[.02]' });
    head.appendChild(el('div', { class: 'sheet-grip' }));

    const headRow = el('div', { class: 'flex items-start justify-between gap-3 px-5 py-4' });
    const titleBox = el('div', { class: 'flex items-start gap-3 min-w-0 flex-1' });

    const toneCls =
      evt.tone === 'pink'  ? 'bg-pink-500/15 text-pink-300 border-pink-500/30' :
      evt.tone === 'cyan'  ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' :
      evt.tone === 'amber' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' :
                             'bg-violet-500/15 text-violet-300 border-violet-500/30';

    const iconBox = el('div', { class: `w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${toneCls}` });
    iconBox.appendChild(el('i', { class: `fa-solid ${evt.icon}` }));

    const titleText = el('div', { class: 'min-w-0 flex-1' });
    const badgeRow = el('div', { class: 'flex items-center gap-2 flex-wrap mb-1' });
    badgeRow.append(
      el('span', {
        class: 'text-[10px] px-2 py-0.5 rounded-md font-black tracking-widest uppercase bg-cyan-500/10 text-cyan-300 border border-cyan-500/25',
        text: 'File Hub',
      }),
      el('span', { class: 'text-[10px] text-slate-500 font-bold', text: `${dayLabel} · ${evt.time} - ${endHour}` }),
    );
    titleText.append(badgeRow, el('h2', { id: 'fileHubModal-title', class: 'font-black text-white text-base leading-tight', text: evt.label }));

    titleBox.append(iconBox, titleText);

    const closeBtn = el('button', {
      class: 'w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition shrink-0',
      'aria-label': 'Đóng',
      'data-action': 'close-modal',
      'data-modal-id': 'fileHubModal',
    });
    closeBtn.appendChild(el('i', { class: 'fa-solid fa-xmark text-sm' }));

    headRow.append(titleBox, closeBtn);
    head.appendChild(headRow);
    content.appendChild(head);

    const body = el('div', { class: 'flex-1 overflow-y-auto scrollbar px-5 py-4 space-y-4 min-h-0' });

    const fileInput = el('input', { type: 'file', class: 'hidden', multiple: true, 'aria-label': 'Chọn tệp' }) as HTMLInputElement;

    const drop = el('label', {
      class: 'block border-2 border-dashed border-white/[.15] hover:border-pink-400/50 hover:bg-pink-400/[.04] rounded-2xl p-6 text-center transition cursor-pointer group',
    });
    drop.appendChild(fileInput);
    const dropIconWrap = el('div', { class: 'w-12 h-12 rounded-full bg-white/5 group-hover:bg-pink-500/15 mx-auto flex items-center justify-center mb-2.5 transition' });
    dropIconWrap.appendChild(el('i', { class: 'fa-solid fa-cloud-arrow-up text-lg text-slate-400 group-hover:text-pink-400 transition' }));
    drop.append(
      dropIconWrap,
      el('p', { class: 'text-sm text-white font-bold', text: 'Kéo thả file vào đây' }),
      el('p', { class: 'text-[10px] text-slate-500 mt-1', text: 'Tự động tối ưu Ảnh (ImageKit) · Tài liệu (B2) · Video (Supabase)' }),
    );
    body.appendChild(drop);

    const listWrap = el('div', { id: 'fileHubList', class: 'space-y-2' });
    body.appendChild(listWrap);

    const empty = el('div', { class: 'hidden text-center py-10 px-4' });
    empty.append(
      el('i', { class: 'fa-regular fa-folder-open text-3xl text-slate-700 mb-3 block' }),
      el('p', { class: 'text-sm font-bold text-slate-300', text: 'Chưa có tài nguyên nào' }),
    );
    body.appendChild(empty);
    content.appendChild(body);

    const footer = el('div', { class: 'shrink-0 px-5 py-3.5 border-t border-white/[.06] bg-black/30 flex justify-between items-center gap-3 flex-wrap' });
    const statLine = el('div', { class: 'text-[11px] text-slate-500 font-bold' });
    const closeFooterBtn = el('button', {
      class: 'text-xs font-bold text-white bg-gradient-to-r from-pink-600 to-violet-600 px-4 py-2 rounded-xl shadow-neon-pink hover:opacity-95 transition active:scale-[0.98]',
      'data-action': 'close-modal',
      'data-modal-id': 'fileHubModal',
      text: 'Đóng',
    });
    footer.append(statLine, closeFooterBtn);
    content.appendChild(footer);

    const renderList = (): void => {
      const state = S.snapshot() as AppStateLike;
      const files = state.files[eventId] ?? [];
      clear(listWrap);

      const total = files.reduce((s, f) => s + (f.size || 0), 0);
      statLine.textContent = files.length ? `${files.length} file · ${fmtBytes(total)}` : 'Chưa có file nào';

      if (!files.length) {
        empty.classList.remove('hidden');
        listWrap.classList.add('hidden');
        return;
      }
      empty.classList.add('hidden');
      listWrap.classList.remove('hidden');

      const frag = document.createDocumentFragment();
      files.forEach((f) => {
        const meta = fileIcon(f.name);
        const row = el('div', { class: 'flex items-center gap-3 p-3 rounded-xl bg-white/[.02] border border-white/[.05] hover:bg-white/[.04] transition' });

        const iconEl = el('div', { class: `w-10 h-10 rounded-xl ${meta.bg} ${meta.cls} flex items-center justify-center shrink-0` });
        iconEl.appendChild(el('i', { class: `fa-solid ${meta.icon}` }));
        row.appendChild(iconEl);

        const info = el('div', { class: 'flex-1 min-w-0' });
        const metaLine = el('p', { class: 'text-[10px] text-slate-500 truncate flex items-center gap-1.5 flex-wrap' });
        metaLine.appendChild(document.createTextNode(fmtBytes(f.size)));
        
        // Badge hiển thị nơi lưu trữ
        if (f.kind === 'image') metaLine.appendChild(el('span', { class: 'text-cyan-400 font-bold', text: '· ImageKit' }));
        else if (f.kind === 'document') metaLine.appendChild(el('span', { class: 'text-amber-400 font-bold', text: '· B2' }));
        else if (f.kind === 'video') metaLine.appendChild(el('span', { class: 'text-violet-400 font-bold', text: '· Supabase' }));

        metaLine.appendChild(document.createTextNode(`· ${f.uploadedBy} · ${new Date(f.at).toLocaleString('vi-VN')}`));

        info.append(el('p', { class: 'text-sm font-bold text-white truncate', text: f.name }), metaLine);
        row.appendChild(info);

        const actions = el('div', { class: 'flex gap-1 shrink-0' });
        const dlBtn = el('button', {
          class: 'w-8 h-8 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition flex items-center justify-center',
          'aria-label': 'Tải về', title: 'Tải về',
        });
        dlBtn.appendChild(el('i', { class: 'fa-solid fa-download text-xs' }));
        
        // LOGIC TẢI XUỐNG MỚI (Đã fix lỗi TS)
        dlBtn.addEventListener('click', async () => {
          try {
            dlBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i>';
            const signedUrl = await getFileDownloadUrl(f);
            window.open(signedUrl, '_blank', 'noopener');
            dlBtn.innerHTML = '<i class="fa-solid fa-download text-xs"></i>';
          } catch (error) {
            Toast.show('Lỗi khi lấy link tải file', { type: 'error' });
            dlBtn.innerHTML = '<i class="fa-solid fa-download text-xs"></i>';
          }
        });

        const delBtn = el('button', {
          class: 'w-8 h-8 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition flex items-center justify-center',
          'aria-label': 'Xóa', title: 'Xóa',
        });
        delBtn.appendChild(el('i', { class: 'fa-solid fa-trash text-xs' }));
        delBtn.addEventListener('click', () => { void deleteFileFromHub(eventId, f.id); });

        actions.append(dlBtn, delBtn);
        row.appendChild(actions);

        frag.appendChild(row);
      });
      listWrap.appendChild(frag);
    };

    renderList();

    fileInput.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      const files = Array.from(target.files ?? []);
      if (files.length) void handleUploads(files, evt.id).then(() => renderList());
      target.value = '';
    });

    const unsub = S.select((s) => (s as AppStateLike).files, () => renderList());
    const obs = new MutationObserver(() => {
      if (!document.body.contains(content)) {
        unsub();
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  });
}

/* ─────────────────────────────────────────────
   DELETE FILE (undo + rollback)
   ───────────────────────────────────────────── */
async function deleteFileFromHub(eventId: string, fileId: string): Promise<void> {
  const state = S.snapshot() as AppStateLike;
  const arr = state.files[eventId] ?? [];
  const target = arr.find((f) => f.id === fileId);
  if (!target) return;

  const before = arr.slice();
  const filesMap = { ...state.files };
  filesMap[eventId] = arr.filter((f) => f.id !== fileId);
  S.patch({ files: filesMap });

  let undone = false;
  Toast.show(`Đã xóa "${target.name}"`, {
    type: 'warn',
    timeout: 5500,
    action: {
      label: '↩ Hoàn tác',
      handler() {
        undone = true;
        const s2 = S.snapshot() as AppStateLike;
        const fm2 = { ...s2.files };
        fm2[eventId] = before;
        S.patch({ files: fm2 });
        Toast.show('Đã khôi phục file.', { type: 'success' });
      },
    },
  });

  setTimeout(() => {
    if (undone) return;
    void (async () => {
      let storageDeleted = true;
      let metadataDeleted = true;
      
      if (target.storage_path) {
        // Truyền target.kind vào hàm xóa để biết nên xóa ImageKit, B2 hay Supabase
        storageDeleted = await deleteFileFromStorage(target.storage_path, target.kind, target.id);
      }
      if (storageDeleted) {
        try { metadataDeleted = await deleteFileMetadata(target.id); }
        catch { metadataDeleted = false; }
      }
      
      if (storageDeleted && metadataDeleted) {
        broadcast('file:deleted', { eventId, name: target.name });
      } else if (!storageDeleted) {
        const s4 = S.snapshot() as AppStateLike;
        const files4 = { ...s4.files };
        files4[eventId] = before;
        S.patch({ files: files4 });
        Toast.show('⚠️ Không xóa được — đã khôi phục', { type: 'warn', timeout: 4000 });
      } else {
        Toast.show('⚠️ File đã xóa nhưng còn metadata', { type: 'warn', timeout: 4000 });
        broadcast('file:deleted', { eventId, name: target.name });
      }
    })();
  }, 5500);
}
