import { supabase } from '@/core/supabase';

/* ─────────────────────────────────────────────
   TYPES
   ───────────────────────────────────────────── */
export type StorageType = 'image' | 'document' | 'video';

export interface UploadResult {
  url: string;
  fileType: StorageType;
  storagePath: string;
}

export interface AppFile {
  id: string;
  name: string;
  size: number;
  originalSize: number;
  kind: string;
  uploadedBy: string;
  at: number;
  storage_path: string;
  public_url: string;
  savedPct?: number;
}

/* ─────────────────────────────────────────────
   HELPERS
   ───────────────────────────────────────────── */
const DOC_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'zip', 'txt', 'csv', 'json', 'md', 'sql',
];

export function getStorageType(file: File): StorageType {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  if (DOC_EXTENSIONS.includes(ext)) return 'document';
  return 'document';
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

/* ─────────────────────────────────────────────
   UPLOAD ROUTING
   ───────────────────────────────────────────── */
interface UploadUrlResponse {
  provider: 'b2' | 'imagekit' | 'supabase';
  storagePath: string;
  // B2
  uploadUrl?: string;
  headers?: Record<string, string>;
  // ImageKit
  publicKey?: string;
  token?: string;
  expire?: number;
  signature?: string;
  fileName?: string;
  folder?: string;
  // Supabase
  signedUrl?: string;
  publicUrl?: string;
}

export async function uploadFile(file: File, folder: string = 'general'): Promise<UploadResult> {
  const type = getStorageType(file);
  const provider: 'b2' | 'imagekit' | 'supabase' =
    type === 'image' ? 'imagekit' : type === 'video' ? 'supabase' : 'b2';

  const info = await postJson<UploadUrlResponse>('/api/upload-url', {
    fileName: file.name,
    fileType: file.type || 'application/octet-stream',
    provider,
    folder,
  });

  if (info.provider === 'b2') {
    const put = await fetch(info.uploadUrl!, {
      method: 'PUT',
      headers: info.headers ?? { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    if (!put.ok) throw new Error(`B2 upload thất bại (${put.status})`);
    return { url: '', fileType: 'document', storagePath: info.storagePath };
  }

  if (info.provider === 'imagekit') {
    const form = new FormData();
    form.append('file', file);
    form.append('fileName', info.fileName!);
    form.append('publicKey', info.publicKey!);
    form.append('token', info.token!);
    form.append('expire', String(info.expire!));
    form.append('signature', info.signature!);
    if (info.folder) form.append('folder', info.folder);

    const res = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(err.message || `ImageKit upload thất bại (${res.status})`);
    }
    const data = (await res.json()) as { url: string; fileId: string };
    return { url: data.url, fileType: 'image', storagePath: data.fileId };
  }

  // supabase
  const put = await fetch(info.signedUrl!, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'video/mp4', 'x-upsert': 'false' },
    body: file,
  });
  if (!put.ok) throw new Error(`Supabase upload thất bại (${put.status})`);
  return { url: info.publicUrl!, fileType: 'video', storagePath: info.storagePath };
}

/* ─────────────────────────────────────────────
   METADATA
   ───────────────────────────────────────────── */
export async function saveFileMetadata(
  file: File,
  result: UploadResult,
  folderId: string,
  context: 'event' | 'project',
): Promise<AppFile> {
  return postJson<AppFile>('/api/file-metadata', {
    name: file.name,
    size: file.size,
    mimeType: file.type || 'application/octet-stream',
    kind: result.fileType,
    storagePath: result.storagePath,
    publicUrl: result.url,
    folderId,
    context,
  });
}

/* ─────────────────────────────────────────────
   DELETE
   ───────────────────────────────────────────── */
export async function deleteFileFromStorage(storagePath: string, fileType: string): Promise<boolean> {
  try {
    const data = await postJson<{ success: boolean }>('/api/file-delete', {
      mode: 'storage',
      storagePath,
      kind: fileType,
    });
    return data.success;
  } catch (err) {
    console.error('Lỗi khi xóa file:', err);
    return false;
  }
}

export async function deleteFileMetadata(id: string): Promise<boolean> {
  try {
    const data = await postJson<{ success: boolean }>('/api/file-delete', {
      mode: 'metadata',
      fileId: id,
    });
    return data.success;
  } catch (err) {
    console.error('Lỗi khi xóa metadata:', err);
    return false;
  }
}
