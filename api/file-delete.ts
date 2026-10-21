// api/file-delete.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { supabaseAdmin, verifyUser, setCors } from './_lib/supabase';

const s3 = new S3Client({
  endpoint: process.env.B2_ENDPOINT!,
  region: process.env.B2_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.B2_KEY_ID!,
    secretAccessKey: process.env.B2_APPLICATION_KEY!,
  },
});

const SUPABASE_BUCKET = process.env.SUPABASE_VIDEO_BUCKET || 'fpc-files';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyUser(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Cần đăng nhập' });

  const b = (req.body ?? {}) as {
    mode?: 'storage' | 'metadata';
    storagePath?: string;
    kind?: string;
    fileId?: string;
  };

  try {
    if (b.mode === 'storage') {
      if (!b.storagePath || !b.kind) return res.status(400).json({ error: 'Thiếu storagePath/kind' });

      if (b.kind === 'image') {
        const privateKey = process.env.IMAGEKIT_PRIVATE_KEY!;
        const r = await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(b.storagePath)}`, {
          method: 'DELETE',
          headers: { Authorization: `Basic ${Buffer.from(privateKey + ':').toString('base64')}` },
        });
        return res.json({ success: r.ok });
      }
      if (b.kind === 'document') {
        await s3.send(new DeleteObjectCommand({ Bucket: process.env.B2_BUCKET!, Key: b.storagePath }));
        return res.json({ success: true });
      }
      if (b.kind === 'video') {
        const { error } = await supabaseAdmin.storage.from(SUPABASE_BUCKET).remove([b.storagePath]);
        return res.json({ success: !error });
      }
      return res.json({ success: false });
    }

    if (b.mode === 'metadata') {
      if (!b.fileId) return res.status(400).json({ error: 'Thiếu fileId' });
      const { error } = await supabaseAdmin.from('files').delete().eq('id', b.fileId);
      return res.json({ success: !error });
    }

    return res.status(400).json({ error: 'mode không hợp lệ' });
  } catch (err) {
    console.error('[file-delete]', err);
    return res.status(500).json({ error: 'Không xóa được', success: false });
  }
}
