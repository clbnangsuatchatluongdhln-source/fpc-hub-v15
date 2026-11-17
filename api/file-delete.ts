// api/file-delete.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {deleteStoredObject} from './_lib/storage-delete';
import { supabaseAdmin, setCors } from './_lib/supabase';
import { authorizedFile, StorageError } from './_lib/storage';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if(!setCors(res,req.headers.origin))return res.status(403).json({error:'Origin không được phép'});
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const b = (req.body ?? {}) as {
    mode?: 'storage' | 'metadata';
    storagePath?: string;
    kind?: string;
    fileId?: string;
  };

  try {
    if(b.mode!=='storage' && b.mode!=='metadata')return res.status(400).json({error:'mode không hợp lệ'});
    const file=await authorizedFile(req.headers.authorization,b,'delete');

    if (b.mode === 'storage') {await deleteStoredObject(file);return res.json({success:true});}

    if (b.mode === 'metadata') {
      const { error } = await supabaseAdmin.from('files').delete().eq('id', file.id);
      return res.json({ success: !error });
    }

    return res.status(400).json({ error: 'mode không hợp lệ' });
  } catch (err) {
    if(err instanceof StorageError)return res.status(err.status).json({error:err.message});
    console.error('[file-delete] Không xóa được tệp');
    return res.status(500).json({ error: 'Không xóa được', success: false });
  }
}
