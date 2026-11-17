import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split(/\r?\n/).filter(line => /^\w+=/.test(line))
  .map(line => { const split = line.indexOf('='); return [line.slice(0, split), line.slice(split + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const credentialPath = process.argv[2];
const key = credentialPath ? readFileSync(credentialPath, 'utf8').match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/)?.[0]
  : env.VITE_SUPABASE_ANON_KEY;
if (!key || !env.VITE_SUPABASE_URL) throw new Error('Missing local connection configuration');
const sb = createClient(env.VITE_SUPABASE_URL, key,
  { auth: { persistSession: false, autoRefreshToken: false } });
for (const [table, columns] of [
  ['messages', 'id,conversation_id,client_id,type,content,created_at,status'],
  ['conversation_states', 'user_id,conversation_id,is_muted,is_archived,last_seen_msg_id'],
  ['notifications', 'id,user_id,message_id,is_read'],
]) {
  const { error, count } = await sb.from(table).select(columns, { count: 'exact', head: true });
  console.log(JSON.stringify({ table, ok: !error, count, errorCode: error?.code ?? null }));
  if (error) process.exitCode = 1;
}
