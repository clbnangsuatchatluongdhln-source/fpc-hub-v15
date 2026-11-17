import { supabase } from '../../core/supabase';
import type { FileRecord } from '../../core/types';
import { uploadObject, finalizeObject, getObjectUrl, removeObject } from '../../core/storage/client';
import { referenceFromMetadata } from '../../core/storage/types';

export async function fetchFiles(): Promise<FileRecord[]> {
  const { data, error } = await supabase
    .from('files')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as FileRecord[];
}

export async function uploadFileToHub(file: File, opts?: { projectId?: string | null; eventId?: string | null }): Promise<void> {
  if(opts?.projectId && opts?.eventId)throw new Error('Chọn một nơi đính kèm');
  const object=await uploadObject(file,{target:'hub',context:opts?.projectId?'project':opts?.eventId?'event':'hub',
    parentId:opts?.projectId || opts?.eventId || undefined});
  await finalizeObject(object);
}

export async function getSignedDownloadUrl(file: FileRecord | string, expiresIn = 60): Promise<string> {
  return getObjectUrl(referenceFromMetadata(typeof file==='string'
    ? {storage_path:file,storage_provider:'supabase',file_type:'file'}:file),expiresIn);
}

export async function deleteFileRecord(record: FileRecord): Promise<void> {
  if (record.storage_path) {
    await removeObject(referenceFromMetadata(record));
  }
  const { error: dErr } = await supabase.from('files').delete().eq('id', record.id);
  if (dErr) throw new Error(dErr.message);
}
