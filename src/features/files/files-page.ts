import {mountStorageDashboard} from './storage-dashboard';
import { Toast } from '../../ui/toast';
import { escHtml } from '../../utils';
import type { FileRecord } from '../../core/types';
import { deleteFileRecord, fetchFiles, getSignedDownloadUrl, uploadFileToHub } from './file-service';

let disposeStorageDashboard:(()=>void)|undefined;

const state = {
  files: [] as FileRecord[],
  loading: false,
  search: '',
};

function injectFilesDOM(): void {
  const existing = document.getElementById('filesSection');
  if (existing?.dataset.fpcFiles === '1') return;

  const anchor = document.getElementById('adminSection') || document.getElementById('projectsSection');
  if (!anchor) return;

  const sec = existing || document.createElement('section');
  sec.id = 'filesSection';
  sec.className = 'hidden space-y-4';
  sec.dataset.fpcFiles = '1';
  sec.innerHTML = `
    <div class="glass rounded-2xl overflow-hidden">
      <div class="p-5 border-b border-white/[.06] flex justify-between items-center gap-3 flex-wrap">
        <div>
          <h2 class="text-lg font-black text-white flex items-center gap-2">
            <i class="fa-solid fa-folder-open text-orange-400"></i> Kho tài nguyên
          </h2>
          <p class="text-xs text-slate-500 mt-0.5"><span id="filesCount">0</span> tệp · Tài liệu nội bộ, ảnh sự kiện, biên bản họp</p>
        </div>
        <div class="flex items-center gap-2 w-full sm:w-auto">
          <div class="relative flex-1 sm:w-64">
            <i class="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs pointer-events-none"></i>
            <input id="filesSearch" type="text" placeholder="Tìm file..." class="w-full bg-black/30 border border-white/[.08] rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500/50 transition">
          </div>
          <input id="filesInput" type="file" class="hidden" multiple>
          <button id="filesUploadBtn" class="px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-violet-600 text-white text-xs font-black hover:opacity-95 active:scale-[0.98] transition flex items-center gap-2 shrink-0">
            <i class="fa-solid fa-cloud-arrow-up text-[11px]"></i>
            <span>Tải lên</span>
          </button>
        </div>
      </div>
      <div id="filesList" class="divide-y divide-white/[.04]"></div>
      <div id="filesEmpty" class="hidden text-center py-16 px-6">
        <div class="w-16 h-16 rounded-2xl bg-white/[.03] mx-auto mb-4 flex items-center justify-center">
          <i class="fa-solid fa-folder-open text-2xl text-slate-700"></i>
        </div>
        <p class="text-slate-400 font-bold text-sm">Chưa có file nào</p>
        <p class="text-xs text-slate-500 mt-1 max-w-xs mx-auto">Bấm "Tải lên" để thêm tài nguyên đầu tiên</p>
      </div>
    </div>
  `;
  if (!existing) anchor.parentNode?.insertBefore(sec, anchor.nextSibling);
}

function formatBytes(n: number | null): string {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function render(): void {
  const listEl = document.getElementById('filesList');
  const emptyEl = document.getElementById('filesEmpty');
  const countEl = document.getElementById('filesCount');
  if (!listEl) return;

  if (countEl) countEl.textContent = String(state.files.length);

  const q = state.search.toLowerCase().trim();
  const visible = q ? state.files.filter((f) => f.name.toLowerCase().includes(q)) : state.files;

  listEl.replaceChildren();

  if (state.loading) {
    for (let i = 0; i < 3; i++) {
      const skel = document.createElement('div');
      skel.className = 'h-16 skel';
      listEl.appendChild(skel);
    }
    emptyEl?.classList.add('hidden');
    return;
  }

  if (!visible.length) {
    emptyEl?.classList.remove('hidden');
    listEl.classList.add('hidden');
    return;
  }

  emptyEl?.classList.add('hidden');
  listEl.classList.remove('hidden');

  for (const f of visible) {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-3 px-5 py-3 hover:bg-white/[.02] transition';
    row.innerHTML = `
      <div class="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center shrink-0">
        <i class="fa-solid fa-file text-orange-400 text-sm"></i>
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-bold text-white truncate">${escHtml(f.name)}</div>
        <div class="text-xs text-slate-500">${formatBytes(f.size)} · ${new Date(f.created_at).toLocaleDateString('vi-VN')}</div>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <button class="w-8 h-8 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition flex items-center justify-center" data-download="${f.id}" title="Tải xuống">
          <i class="fa-solid fa-download text-xs"></i>
        </button>
        <button class="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition flex items-center justify-center" data-delete="${f.id}" title="Xóa">
          <i class="fa-solid fa-trash text-xs"></i>
        </button>
      </div>
    `;
    row.querySelector(`[data-download="${f.id}"]`)?.addEventListener('click', () => void handleDownload(f));
    row.querySelector(`[data-delete="${f.id}"]`)?.addEventListener('click', () => void handleDelete(f));
    listEl.appendChild(row);
  }
}

async function refresh(): Promise<void> {
  state.loading = true;
  render();
  try {
    state.files = await fetchFiles();
  } catch {
    Toast.show('Không tải được danh sách file', { type: 'error' });
  } finally {
    state.loading = false;
    render();
  }
}

async function handleUpload(fileList: FileList | File[]): Promise<void> {
  const arr = Array.from(fileList);
  for (const file of arr) {
    try {
      Toast.show(`Đang tải "${file.name}"...`, { type: 'info' });
      await uploadFileToHub(file);
      Toast.show(`Đã tải "${file.name}"`, { type: 'success' });
    } catch (err) {
      Toast.show(`Lỗi "${file.name}": ${err instanceof Error ? err.message : ''}`, { type: 'error' });
    }
  }
  await refresh();
}

async function handleDownload(f: FileRecord): Promise<void> {
  if (!f.storage_path) return;
  try {
    const url = await getSignedDownloadUrl(f);
    window.open(url, '_blank', 'noopener');
  } catch {
    Toast.show('Không lấy được link tải', { type: 'error' });
  }
}

async function handleDelete(f: FileRecord): Promise<void> {
  if (!window.confirm(`Xóa file "${f.name}"?`)) return;
  try {
    await deleteFileRecord(f);
    Toast.show('Đã xóa file', { type: 'success' });
    await refresh();
  } catch {
    Toast.show('Lỗi xóa file', { type: 'error' });
  }
}

function bindOnce(): void {
  const search = document.getElementById('filesSearch') as HTMLInputElement | null;
  const fileInput = document.getElementById('filesInput') as HTMLInputElement | null;
  const uploadBtn = document.getElementById('filesUploadBtn');

  if (search && search.dataset.bound !== '1') {
    search.dataset.bound = '1';
    search.addEventListener('input', () => { state.search = search.value; render(); });
  }

  if (uploadBtn && uploadBtn.dataset.bound !== '1') {
    uploadBtn.dataset.bound = '1';
    uploadBtn.addEventListener('click', () => fileInput?.click());
  }

  if (fileInput && fileInput.dataset.bound !== '1') {
    fileInput.dataset.bound = '1';
    fileInput.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files?.length) void handleUpload(target.files);
      target.value = '';
    });
  }
}

export async function initFilesFeature(): Promise<void> {
  injectFilesDOM();
  bindOnce();
  disposeStorageDashboard?.();
  const host=document.getElementById('filesSection');
  if(host)disposeStorageDashboard=mountStorageDashboard(host);
  await refresh();
}

export function destroyFilesFeature(): void {
  disposeStorageDashboard?.();disposeStorageDashboard=undefined;
  state.files = [];
  state.search = '';
  state.loading = false;
}
