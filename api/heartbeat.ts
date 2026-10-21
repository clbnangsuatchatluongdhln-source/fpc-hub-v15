// api/heartbeat.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ── Bảo vệ endpoint: Vercel Cron gửi header Authorization ──
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET) {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    // Truy vấn siêu nhẹ — chỉ cần chạm vào database là đủ đánh thức Supabase
    const { error } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .limit(1);

    if (error) throw error;

    console.log('[heartbeat] Supabase OK');
    return res.status(200).json({ ok: true, at: new Date().toISOString() });
  } catch (err) {
    console.error('[heartbeat] failed:', err);
    return res.status(500).json({ ok: false });
  }
}
