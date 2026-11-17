export type StorageProvider = 'supabase' | 'b2' | 'imagekit' | 'r2' | 'tigris';
export type StorageKind = 'image' | 'document' | 'video';

export interface StoredObject {
  id?: string;
  provider: StorageProvider;
  bucket?: string;
  storagePath: string;
  url?: string;
  kind: StorageKind;
}

export interface UploadResult extends StoredObject {
  ticketId: string;
  objectId?: string;
  url: string;
  fileType: StorageKind;
}

export interface FileMetadataLike {
  id?: string;
  storage_path?: string | null;
  storage_provider?: string | null;
  storage_bucket?: string | null;
  file_type?: string | null;
  kind?: string | null;
  public_url?: string | null;
}

export function classifyFile(file: Pick<File, 'type'>): StorageKind {
  return file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'document';
}

export function referenceFromMetadata(file: FileMetadataLike, source: 'hub' | 'legacy' = 'hub'): StoredObject {
  if (!file.storage_path) throw new Error('Tệp chưa có địa chỉ lưu trữ');
  const kind = file.kind === 'image' || file.kind === 'video' ? file.kind : 'document';
  const explicit = file.storage_provider;
  const provider = explicit || (source === 'legacy'
    ? kind === 'image' ? 'imagekit' : kind === 'video' ? 'supabase' : 'b2' : 'supabase');
  if (!['supabase', 'b2', 'imagekit', 'r2','tigris'].includes(provider)) {
    throw new Error('Chưa hỗ trợ nơi lưu của tệp này; không tự chuyển sang kho khác');
  }
  return { id: file.id, provider: provider as StorageProvider, kind, storagePath: file.storage_path,
    url: file.public_url || undefined,
    bucket: file.storage_bucket || (provider === 'supabase'
      ? kind === 'video' && (file.storage_path.startsWith('videos/') || source === 'legacy' && file.file_type !== 'file') ? 'fpc-files' : 'files' : undefined) };
}
