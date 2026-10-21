// api/file-metadata.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin, verifyUser, setCors } from './_lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyUser(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Cần đăng nhập' });

  const b = (req.body ?? {}) as {
    name?: string;
    size?: number;
    mimeType?: string;
    kind?: string;
    storagePath?: string;
    publicUrl?: string;
    folderId?: string;
    context?: 'event' | 'project';
  };
  if (!b.name || !b.storagePath || !b.kind || !b.folderId || !b.context) {
    return res.status(400).json({ error: 'Thiếu trường bắt buộc' });
  }

  const row = {
    name: b.name,
    size: b.size ?? 0,
    original_size: b.size ?? 0,
    mime_type: b.mimeType || 'application/octet-stream',
    kind: b.kind,
    storage_path: b.storagePath,
    public_url: b.publicUrl || '',
    event_id: b.context === 'event' ? b.folderId : null,
    project_id: b.context === 'project' ? b.folderId : null,
    uploaded_by: user.id,
    saved_pct: 0,
  };

  try {
    const { data, error } = await supabaseAdmin
      .from('files')
      .insert(row)
      .select()
      .single();
    if (error) throw error;

    return res.json({
      id: data.id,
      name: data.name,
      size: data.size,
      originalSize: data.original_size,
      kind: data.kind,
      uploadedBy: 'Bạn',
      at: new Date(data.created_at).getTime(),
      storage_path: data.storage_path,
      public_url: data.public_url,
    });
  } catch (err) {
    console.error('[file-metadata]', err);
    return res.status(500).json({ error: 'Không lưu được metadata' });
  }
}
