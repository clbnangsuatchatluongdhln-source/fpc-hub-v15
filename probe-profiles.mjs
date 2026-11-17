import { createClient } from '@supabase/supabase-js';

const URL = 'https://auqxbigkttrktwsfrdba.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY?.trim()) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

async function main() {
  const { data: profiles, error } = await sb.from('profiles').select('id, display_name, email, role');
  console.log('PROFILES count =', profiles?.length ?? 0, 'error =', error?.message ?? 'none');
  for (const p of profiles ?? []) console.log(' -', p.id, p.display_name, p.email, p.role);

  const { data: usersPage, error: uErr } = await sb.auth.admin.listUsers({ page: 1, perPage: 20 });
  console.log('AUTH users count =', usersPage?.users?.length ?? 0, 'error =', uErr?.message ?? 'none');
  for (const u of usersPage?.users ?? []) console.log(' auth -', u.id, u.email, u.created_at);
}

main().catch((e) => { console.error('ERR', e); process.exit(1); });
