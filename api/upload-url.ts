// api/upload-url.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'node:crypto';
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

  const { fileName, fileType, provider, folder = 'general' } = (req.body ?? {}) as {
    fileName?: string;
    fileType?: string;
    provider?: 'b2' | 'imagekit' | 'supabase';
    folder?: string;
  };
  if (!fileName || !provider) return res.status(400).json({ error: 'Thiếu fileName/provider' });

  const ext = (fileName.split('.').pop() ?? 'bin').toLowerCase();
  const safeFolder = folder.replace(/[^a-z0-9_-]/gi, '') || 'general';
  const uniqueName = `${safeFolder}/${Date.now()}_${crypto.randomUUID()}.${ext}`;

  try {
    if (provider === 'b2') {
      const cmd = new PutObjectCommand({
        Bucket: process.env.B2_BUCKET!,
        Key: uniqueName,
        ContentType: fileType || 'application/octet-stream',
      });
      const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 900 });
      return res.json({
        provider: 'b2',
        uploadUrl,
        storagePath: uniqueName,
        headers: { 'Content-Type': fileType || 'application/octet-stream' },
      });
    }

    if (provider === 'imagekit') {
      const privateKey = process.env.IMAGEKIT_PRIVATE_KEY!;
      const publicKey = process.env.IMAGEKIT_PUBLIC_KEY!;
      const token = crypto.randomUUID();
      const expire = Math.floor(Date.now() / 1000) + 30 * 60;
      const signature = crypto.createHmac('sha1', privateKey).update(token + expire).digest('hex');
      return res.json({
        provider: 'imagekit',
        publicKey,
        token,
        expire,
        signature,
        fileName: `${crypto.randomUUID()}_${fileName}`,
        folder: `/fpc-hub/${safeFolder}`,
      });
    }

    if (provider === 'supabase') {
      const path = `videos/${uniqueName}`;
      const { data, error } = await supabaseAdmin.storage
        .from(SUPABASE_BUCKET)
        .createSignedUploadUrl(path);
      if (error) throw error;
      const { data: pub } = supabaseAdmin.storage.from(SUPABASE_BUCKET).getPublicUrl(path);
      return res.json({
        provider: 'supabase',
        signedUrl: data.signedUrl,
        storagePath: path,
        publicUrl: pub.publicUrl,
      });
    }

    return res.status(400).json({ error: 'provider không hợp lệ' });
  } catch (err) {
    console.error('[upload-url]', err);
    return res.status(500).json({ error: 'Không tạo được URL upload' });
  }
}
