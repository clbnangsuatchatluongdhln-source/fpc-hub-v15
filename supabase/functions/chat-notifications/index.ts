import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { buildNotifications } from '../../../src/features/chat/notifications/trigger.ts';

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const secret = Deno.env.get('CHAT_WEBHOOK_SECRET');
  if (!secret || request.headers.get('x-webhook-secret') !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }
  try {
    const payload = await request.json();
    if (payload.type !== 'INSERT' || payload.schema !== 'public'
      || payload.table !== 'messages' || typeof payload.record?.id !== 'string') {
      return new Response('Invalid event', { status: 400 });
    }
    const sb = createClient(Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: message, error: messageError } = await sb.from('messages')
      .select('id,conversation_id,sender_id,sender_name,text,type,mentions,deleted_at')
      .eq('id', payload.record.id).single();
    if (messageError) throw messageError;
    if (message.deleted_at || !message.sender_id || message.type === 'system') {
      return Response.json({ count: 0 });
    }
    const { data: conversation, error: conversationError } = await sb.from('conversations')
      .select('type,members,scope,department_id').eq('id', message.conversation_id).single();
    if (conversationError) throw conversationError;
    let profileQuery = sb.from('profiles').select('id').eq('approval_status', 'active');
    if (conversation.scope === 'department') {
      const { data: memberships, error } = await sb.from('department_members')
        .select('user_id').eq('department_id', conversation.department_id);
      if (error) throw error;
      profileQuery = profileQuery.in('id', memberships.map(member => member.user_id));
    } else if (conversation.scope !== 'club') profileQuery = profileQuery.in('id', conversation.members);
    const { data: profiles, error: profileError } = await profileQuery;
    if (profileError) throw profileError;
    const { data: states, error: stateError } = await sb.from('conversation_states')
      .select('user_id,is_muted,is_archived').eq('conversation_id', message.conversation_id);
    if (stateError) throw stateError;
    const rows = buildNotifications(message, profiles.map(profile => profile.id), states);
    const notifications = await Promise.all(rows.map(async row => {
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256',
        new TextEncoder().encode(`chat:${row.message_id}:${row.user_id}`)));
      hash[6] = (hash[6] & 15) | 80;
      hash[8] = (hash[8] & 63) | 128;
      const hex = Array.from(hash.slice(0, 16), byte => byte.toString(16).padStart(2, '0')).join('');
      const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      return { id, ...row };
    }));
    if (notifications.length) {
      const { error } = await sb.from('notifications')
        .upsert(notifications, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
    }
    return Response.json({ count: notifications.length });
  } catch {
    return new Response('Notification processing failed', { status: 500 });
  }
});
