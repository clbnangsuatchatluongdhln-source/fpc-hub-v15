import {loadConnection,imageConfig} from './_lib/storage-connections';
// api/download-url.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'node:crypto';
import { setCors, supabaseAdmin } from './_lib/supabase';
import { authorizedFile, fileLocation, objectStore, StorageError } from './_lib/storage';
import { imageDetails } from './_lib/upload-session';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if(!setCors(res,req.headers.origin))return res.status(403).json({error:'Origin không được phép'});
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const file = await authorizedFile(req.headers.authorization, req.body ?? {}, 'read');
    const location = fileLocation(file);
    const connection=await loadConnection(file);
    if (location.provider === 'imagekit') {
      const details=await imageDetails(file.storage_path,connection);
      const config=imageConfig(connection);
      const endpoint=config.endpoint?.replace(/\/+$/,'');
      const privateKey=config.privateKey;
      if(!endpoint || !privateKey)throw new StorageError('Kho ảnh chưa được cấu hình',503);
      const path=details.filePath.split('/').filter(Boolean).map(encodeURIComponent).join('/');
      const expires=Math.floor(Date.now()/1000)+300;
      const signature=crypto.createHmac('sha1',privateKey).update(path+expires).digest('hex');
      return res.json({url:`${endpoint}/${path}?ik-t=${expires}&ik-s=${signature}`});
    }
    if (location.provider === 'supabase') {
      const {data,error}=await supabaseAdmin.storage.from(location.bucket).createSignedUrl(file.storage_path,300);
      if(error)throw error;
      return res.json({url:data.signedUrl});
    }
    const store = objectStore(location.provider,connection);
    const cmd = new GetObjectCommand({ Bucket: store.bucket, Key: file.storage_path,VersionId:file.storage_version??undefined });
    try {
      if(file.storage_bucket && file.storage_bucket!==store.bucket)throw new StorageError('Bucket tệp không khớp cấu hình',409);
      const url = await getSignedUrl(store.client, cmd, { expiresIn: 300 });
      return res.json({ url });
    } finally {store.client.destroy();}
  } catch (err) {
    if(err instanceof StorageError)return res.status(err.status).json({error:err.message});
    console.error('[download-url] Không tạo được link');
    return res.status(500).json({ error: 'Không tạo được link tải' });
  }
}
