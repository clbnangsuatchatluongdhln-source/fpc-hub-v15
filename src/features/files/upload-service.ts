import { supabase } from '@/core/supabase';
import { uploadObject, finalizeObject, removeObject } from '@/core/storage/client';
import { referenceFromMetadata } from '@/core/storage/types';
import type { UploadResult as CommonUploadResult } from '@/core/storage/types';
export { getFileDownloadUrl } from '@/core/storage/legacy-files';

/* ─────────────────────────────────────────────
   TYPES
   ───────────────────────────────────────────── */
export type StorageType = 'image' | 'document' | 'video';

export type UploadResult = CommonUploadResult;

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
  storage_provider?: string;
  storage_bucket?: string;
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
export async function uploadFile(file: File, parentId:string, context:'event'|'project'): Promise<UploadResult> {
  return uploadObject(file, { target:'legacy', parentId,context });
}

/* ─────────────────────────────────────────────
   METADATA
   ───────────────────────────────────────────── */
export async function saveFileMetadata(
  _file: File,
  result: UploadResult,
  _folderId: string,
  _context: 'event' | 'project',
): Promise<AppFile> {
  return finalizeObject<AppFile>(result);
}

/* ─────────────────────────────────────────────
   DELETE
   ───────────────────────────────────────────── */
export async function deleteFileFromStorage(storagePath: string, fileType: string, fileId?:string): Promise<boolean> {
  try {
    await removeObject(referenceFromMetadata({id:fileId,storage_path:storagePath,kind:fileType},'legacy'));
    return true;
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
