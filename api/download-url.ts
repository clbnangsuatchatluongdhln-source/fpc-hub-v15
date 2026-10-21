// api/download-url.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { verifyUser, setCors } from './_lib/supabase';

const s3 = new S3Client({
  endpoint: process.env.B2_ENDPOINT!,
  region: process.env.B2_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.B2_KEY_ID!,
    secretAccessKey: process.env.B2_APPLICATION_KEY!,
  },
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyUser(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Cần đăng nhập' });

  const { storagePath } = (req.body ?? {}) as { storagePath?: string };
  if (!storagePath) return res.status(400).json({ error: 'Thiếu storagePath' });

  try {
    const cmd = new GetObjectCommand({ Bucket: process.env.B2_BUCKET!, Key: storagePath });
    const url = await getSignedUrl(s3, cmd, { expiresIn: 3600 });
    return res.json({ url });
  } catch (err) {
    console.error('[download-url]', err);
    return res.status(500).json({ error: 'Không tạo được link tải' });
  }
}
