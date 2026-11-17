import { createClient } from '@supabase/supabase-js';

const URL = 'https://auqxbigkttrktwsfrdba.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY?.trim()) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });
const log = (ok, msg) => console.log((ok ? 'PASS' : 'FAIL') + ' | ' + msg);

async function main() {
  const { data: profiles, error: pErr } = await sb.from('profiles').select('id, display_name').limit(1);
  if (pErr || !profiles || profiles.length === 0) { console.log('SKIP: không có profile thật'); return; }
  const uA = profiles[0];
  console.log('UserA (thật) =', uA.id, uA.display_name);

  const fakeEmail = `p0test_${Date.now()}@example.invalid`;
  const { data: created, error: cErr } = await sb.auth.admin.createUser({ email: fakeEmail, password: 'P0test_' + Date.now(), email_confirm: true });
  if (cErr || !created?.user) { console.log('SKIP: không tạo được user test', cErr?.message); return; }
  const uB = created.user;
  console.log('UserB (test) =', uB.id, fakeEmail);

  const { data: convs, error: cvErr } = await sb.from('conversations').select('id, type, name').limit(1);
  if (cvErr || !convs || convs.length === 0) { console.log('SKIP: không có conversation'); await sb.auth.admin.deleteUser(uB.id); return; }
  const conv = convs[0];
  console.log('Conv  =', conv.id, conv.type, conv.name);

  try {
    await sb.from('conversation_states').delete().in('user_id', [uA.id, uB.id]).eq('conversation_id', conv.id);

    const r1 = await sb.from('conversation_states').upsert({ user_id: uA.id, conversation_id: conv.id, is_pinned: true }, { onConflict: 'user_id,conversation_id' });
    log(!r1.error, 'upsert A pin=true ' + (r1.error?.message ?? ''));

    const r2 = await sb.from('conversation_states').upsert({ user_id: uB.id, conversation_id: conv.id, is_muted: true }, { onConflict: 'user_id,conversation_id' });
    log(!r2.error, 'upsert B mute=true ' + (r2.error?.message ?? ''));

    const { data: rows1 } = await sb.from('conversation_states').select('user_id, is_pinned, is_muted, version').eq('conversation_id', conv.id).in('user_id', [uA.id, uB.id]);
    const rowA = rows1?.find((r) => r.user_id === uA.id);
    const rowB = rows1?.find((r) => r.user_id === uB.id);
    log(rowA?.is_pinned === true && rowA?.is_muted === false, 'A: pinned=true, muted=false');
    log(rowB?.is_pinned === false && rowB?.is_muted === true, 'B: pinned=false, muted=true (per-user isolated)');
    log(rowA?.version === 1, 'A version=1 sau INSERT, actual=' + rowA?.version);

    const r3 = await sb.from('conversation_states').upsert({ user_id: uA.id, conversation_id: conv.id, is_pinned: false }, { onConflict: 'user_id,conversation_id' });
    log(!r3.error, 'upsert A pin=false (lần 2) ' + (r3.error?.message ?? ''));

    const { data: rowA2 } = await sb.from('conversation_states').select('is_pinned, version').eq('user_id', uA.id).eq('conversation_id', conv.id).single();
    log(rowA2?.is_pinned === false, 'A: pinned=false sau toggle lần 2');
    log(rowA2?.version === 2, 'A version=2 sau UPDATE (trigger touch_row) actual=' + rowA2?.version);

    const { data: rowB2 } = await sb.from('conversation_states').select('is_pinned, is_muted').eq('user_id', uB.id).eq('conversation_id', conv.id).single();
    log(rowB2?.is_muted === true, 'B vẫn mute=true (A toggle không ảnh hưởng B)');
    log(rowB2?.is_pinned === false, 'B pinned=false (A pin lần 1 không lan sang B)');
  } finally {
    await sb.from('conversation_states').delete().in('user_id', [uA.id, uB.id]).eq('conversation_id', conv.id);
    const { error: dErr } = await sb.auth.admin.deleteUser(uB.id);
    console.log('CLEANUP user test + states done', dErr?.message ?? 'ok');
  }
}

main().catch((e) => { console.error('ERR', e); process.exit(1); });
