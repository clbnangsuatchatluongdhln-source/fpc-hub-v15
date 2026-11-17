import { createClient } from '@supabase/supabase-js';

const URL = 'https://auqxbigkttrktwsfrdba.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY?.trim()) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
}
const sb = createClient(URL, KEY, { auth: { persistSession: false } });
const log = (ok, msg) => console.log((ok ? 'PASS' : 'FAIL') + ' | ' + msg);

async function main() {
  const { data: prof } = await sb.from('profiles').select('id, display_name').limit(1).single();
  if (!prof) { console.log('SKIP: no profile'); return; }
  const { data: conv } = await sb.from('conversations').select('id').limit(1).single();
  if (!conv) { console.log('SKIP: no conv'); return; }
  console.log('User =', prof.id, '| Conv =', conv.id);

  const cases = [
    { type: 'text', content: { text: 'Xin chào' }, text: 'Xin chào' },
    { type: 'media', content: { url: 'https://x/y.jpg', mime: 'image/jpeg', width: 100, height: 200, caption: 'Ảnh' }, text: 'Ảnh' },
    { type: 'file', content: { url: 'https://x/y.pdf', name: 'y.pdf', size: 1234, mime: 'application/pdf' }, text: 'y.pdf' },
    { type: 'link', content: { url: 'https://x', title: 'Title', description: 'desc' }, text: 'Title' },
    { type: 'sticker', content: { packId: 'p1', stickerId: 's1' }, text: '[Sticker]' },
    { type: 'location', content: { lat: 10.7, lng: 106.7, label: 'HCM' }, text: 'HCM' },
    { type: 'card', content: { title: 'Card', subtitle: 'Sub', image: 'https://x/c.png', action: 'open' }, text: 'Card' },
    { type: 'system', content: { event: 'Đã tạo nhóm' }, text: 'Đã tạo nhóm' },
  ];

  const createdIds = [];
  let prevId = null;
  try {
    for (const c of cases) {
      const id = crypto.randomUUID();
      const clientId = crypto.randomUUID();
      const { error } = await sb.from('messages').insert({
        id, conversation_id: conv.id, sender_id: prof.id, sender_name: prof.display_name,
        text: c.text, status: 'sent', client_id: clientId, type: c.type, content: c.content,
        reply_to_id: prevId, mentions: [],
      });
      log(!error, 'insert ' + c.type + (error ? ' ERR=' + error.message : ''));
      if (!error) { createdIds.push(id); prevId = id; }
    }

    const { data: rows } = await sb.from('messages').select('id,type,content,client_id,reply_to_id,text,status').in('id', createdIds);
    log(rows?.length === 8, 'fetch 8 rows actual=' + rows?.length);
    for (const c of cases) {
      const r = rows?.find((x) => x.type === c.type);
      log(!!r, c.type + ' row exists');
      if (r) {
        const deepEq = (a, b) => {
          if (a === b) return true;
          if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
          const ka = Object.keys(a); const kb = Object.keys(b);
          if (ka.length !== kb.length) return false;
          return ka.every((k) => deepEq(a[k], b[k]));
        };
        log(deepEq(r.content, c.content), c.type + ' content roundtrip (deep)');
        log(!!r.client_id, c.type + ' client_id present');
        log(r.text === c.text, c.type + ' text derive match');
      }
    }
    const replyCheck = rows?.filter((r) => r.reply_to_id === prevId);
    log(replyCheck?.length === 0, 'last row no reply (prevId chain end)');
    const chained = rows?.filter((r) => r.reply_to_id !== null).length;
    log(chained === 7, 'reply_to_id chain 7 rows actual=' + chained);
  } finally {
    if (createdIds.length) await sb.from('messages').delete().in('id', createdIds);
    console.log('CLEANUP done, deleted=' + createdIds.length);
  }
}

main().catch((e) => { console.error('ERR', e); process.exit(1); });
