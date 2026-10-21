/* ============================================================
   FPC LAB · src/features/chat/chat-service.ts
   Supabase data access + Realtime subscription cho Chat Module.
   ============================================================ */

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { Auth } from '../../core/auth';
import { fmtTime } from '../../utils';
import type {
  Conversation,
  DbConversation,
  DbMessage,
  DbProfile,
  Message,
  MessageStatus,
  RealtimeAction,
  StatusUpdate,
} from './types';

declare global {
  interface Window {
    FPC_SUPABASE?: {
      client: SupabaseClient;
      saveMessage?: (convId: string, msg: Message) => Promise<void>;
    };
  }
}

const DEFAULT_AVATAR_COLOR = 'violet';

function getSb(): SupabaseClient | null {
  return window.FPC_SUPABASE?.client ?? null;
}

function getCurrentUserId(): string | null {
  return Auth.user?.id ?? null;
}

function getCurrentUserName(): string {
  const meta = Auth.user?.user_metadata as
    | { full_name?: string; name?: string }
    | undefined;
  return (
    Auth.profile?.display_name ||
    meta?.full_name ||
    meta?.name ||
    Auth.user?.email?.split('@')[0] ||
    'Bạn'
  );
}

function toTimeString(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return fmtTime(d);
  } catch {
    return '';
  }
}

function toMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function mapDbMessage(m: DbMessage): Message {
  return {
    id: m.id,
    conversation_id: m.conversation_id,
    convId: m.conversation_id,
    senderId: m.sender_id,
    sender_name: m.sender_name ?? 'Thành viên',
    author: m.sender_name ?? 'Thành viên',
    text: m.text,
    status: (m.status ?? 'sent') as MessageStatus,
    created_at: m.created_at,
    at: toMs(m.created_at),
    time: toTimeString(m.created_at),
  };
}

function mapDbConversation(
  c: DbConversation,
  currentUserId: string | null
): Conversation {
  const members = Array.isArray(c.members) ? c.members : [];
  const peerId = members.find((id) => id !== currentUserId) ?? c.peer_id ?? undefined;
  return {
    id: c.id,
    type: c.type,
    name: c.name ?? undefined,
    avatar_url: c.avatar_url ?? undefined,
    avatarColor: c.avatar_color ?? DEFAULT_AVATAR_COLOR,
    members,
    peerId,
    pinned: Boolean(c.pinned),
    muted: Boolean(c.muted),
    unread: 0,
    lastMessageAt: c.last_message_at ? toMs(c.last_message_at) : toMs(c.created_at),
    created_at: c.created_at,
    last_message_at: c.last_message_at ?? undefined,
  };
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/* ============================================================
   READ APIS
   ============================================================ */

export async function fetchConversations(): Promise<Conversation[]> {
  const sb = getSb();
  const myId = getCurrentUserId();
  if (!sb || !myId) return [];

  const { data, error } = await sb
    .from('conversations')
    .select('*')
    .order('last_message_at', { ascending: false });

  if (error) {
    console.warn('[chat-service] fetchConversations error:', error.message);
    return [];
  }

  const rows = (data ?? []) as DbConversation[];
  const userRows = rows.filter(
    (c) =>
      c.type === 'channel' ||
      (Array.isArray(c.members) && c.members.includes(myId))
  );
  return userRows.map((c) => mapDbConversation(c, myId));
}

export async function fetchMessages(convId: string): Promise<Message[]> {
  const sb = getSb();
  if (!sb || !convId) return [];

  const { data, error } = await sb
    .from('messages')
    .select('*')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[chat-service] fetchMessages error:', error.message);
    return [];
  }
  return ((data ?? []) as DbMessage[]).map(mapDbMessage);
}

export async function fetchMessagesBulk(
  convIds: string[]
): Promise<Record<string, Message[]>> {
  const sb = getSb();
  if (!sb || convIds.length === 0) return {};

  const { data, error } = await sb
    .from('messages')
    .select('*')
    .in('conversation_id', convIds)
    .order('created_at', { ascending: true });

  if (error || !data) return {};

  const byConv: Record<string, Message[]> = {};
  for (const cid of convIds) byConv[cid] = [];
  for (const row of data as DbMessage[]) {
    (byConv[row.conversation_id] ??= []).push(mapDbMessage(row));
  }
  return byConv;
}

export async function fetchUsers(): Promise<
  { id: string; name: string; email?: string; role?: string; initial: string }[]
> {
  const sb = getSb();
  if (!sb) return [];
  const { data, error } = await sb.from('profiles').select('*');
  if (error || !data) return [];
  return (data as DbProfile[]).map((p) => ({
    id: p.id,
    name: p.display_name || p.email?.split('@')[0] || 'Người dùng',
    email: p.email ?? undefined,
    role: p.role ?? undefined,
    initial: (p.display_name || p.email || '?').charAt(0).toUpperCase(),
  }));
}

/* ============================================================
   WRITE APIS
   ============================================================ */

export async function sendMessage(
  convId: string,
  text: string
): Promise<Message | null> {
  const sb = getSb();
  const myId = getCurrentUserId();
  if (!sb || !myId || !convId) return null;

  const trimmed = text.trim();
  if (!trimmed) return null;

  const nowIso = new Date().toISOString();
  const msg: Message = {
    id: uuid(),
    conversation_id: convId,
    convId,
    senderId: myId,
    sender_name: getCurrentUserName(),
    author: getCurrentUserName(),
    text: trimmed,
    status: 'sent',
    created_at: nowIso,
    at: toMs(nowIso),
    time: toTimeString(nowIso),
  };

  const { error: msgErr } = await sb.from('messages').insert({
    id: msg.id,
    conversation_id: convId,
    sender_id: myId,
    sender_name: msg.sender_name,
    text: trimmed,
    status: 'sent',
    created_at: nowIso,
  });
  if (msgErr) {
    console.error('[chat-service] sendMessage insert failed:', msgErr.message);
    return null;
  }

  await sb
    .from('conversations')
    .update({ last_message_at: nowIso })
    .eq('id', convId);

  return msg;
}

export async function markConversationAsSeen(convId: string): Promise<void> {
  const sb = getSb();
  const myId = getCurrentUserId();
  if (!sb || !myId || !convId) return;

  const { error } = await sb
    .from('messages')
    .update({ status: 'seen' })
    .eq('conversation_id', convId)
    .neq('sender_id', myId)
    .neq('status', 'seen');
  if (error) console.warn('[chat-service] markSeen error:', error.message);
}

export async function updateMessageStatus(
  msgId: string,
  status: MessageStatus
): Promise<void> {
  const sb = getSb();
  if (!sb || !msgId) return;
  const { error } = await sb
    .from('messages')
    .update({ status })
    .eq('id', msgId);
  if (error) console.warn('[chat-service] updateMessageStatus error:', error.message);
}

export async function toggleConvPin(
  convId: string,
  pinned: boolean
): Promise<void> {
  const sb = getSb();
  if (!sb || !convId) return;
  const { error } = await sb
    .from('conversations')
    .update({ pinned })
    .eq('id', convId);
  if (error) console.warn('[chat-service] toggleConvPin error:', error.message);
}

export async function toggleConvMute(
  convId: string,
  muted: boolean
): Promise<void> {
  const sb = getSb();
  if (!sb || !convId) return;
  const { error } = await sb
    .from('conversations')
    .update({ muted })
    .eq('id', convId);
  if (error) console.warn('[chat-service] toggleConvMute error:', error.message);
}

/* ============================================================
   DM & GROUP
   ============================================================ */

export async function getOrCreateDM(
  userId: string
): Promise<Conversation | null> {
  const sb = getSb();
  const myId = getCurrentUserId();
  if (!sb || !myId || !userId || userId === myId) return null;

  const { data, error } = await sb
    .from('conversations')
    .select('*')
    .eq('type', 'dm')
    .contains('members', [userId])
    .order('created_at', { ascending: false });

  if (!error && data) {
    const match = (data as DbConversation[]).find(
      (c) => Array.isArray(c.members) && c.members.includes(myId)
    );
    if (match) return mapDbConversation(match, myId);
  }

  const newId = uuid();
  const nowIso = new Date().toISOString();
  const members = [myId, userId];

  const { error: insErr } = await sb.from('conversations').upsert(
    {
      id: newId,
      type: 'dm',
      peer_id: userId,
      members,
      created_by: myId,
      pinned: false,
      muted: false,
      avatar_color: DEFAULT_AVATAR_COLOR,
      created_at: nowIso,
      last_message_at: nowIso,
    },
    { onConflict: 'id' }
  );

  if (insErr) {
    console.error('[chat-service] createDM failed:', insErr.message);
    return null;
  }

  return {
    id: newId,
    type: 'dm',
    peerId: userId,
    members,
    avatarColor: DEFAULT_AVATAR_COLOR,
    pinned: false,
    muted: false,
    unread: 0,
    lastMessageAt: toMs(nowIso),
    created_at: nowIso,
    last_message_at: nowIso,
  };
}

export async function createGroup(
  name: string,
  members: string[]
): Promise<Conversation | null> {
  const sb = getSb();
  const myId = getCurrentUserId();
  if (!sb || !myId) return null;

  const trimmedName = name.trim();
  if (!trimmedName || trimmedName.length > 60) return null;
  if (members.length < 2) return null;

  const groupId = uuid();
  const nowIso = new Date().toISOString();
  const allMembers = [myId, ...members];

  const { error } = await sb.from('conversations').insert({
    id: groupId,
    type: 'group',
    name: trimmedName,
    avatar_color: 'violet',
    members: allMembers,
    created_by: myId,
    pinned: false,
    muted: false,
    created_at: nowIso,
    last_message_at: nowIso,
  });
  if (error) {
    console.error('[chat-service] createGroup failed:', error.message);
    return null;
  }

  await sb.from('messages').insert({
    id: uuid(),
    conversation_id: groupId,
    sender_id: myId,
    sender_name: 'Hệ thống',
    text: `Đã tạo nhóm "${trimmedName}"`,
    status: 'seen',
    created_at: nowIso,
  });

  return {
    id: groupId,
    type: 'group',
    name: trimmedName,
    members: allMembers,
    avatarColor: 'violet',
    pinned: false,
    muted: false,
    unread: 0,
    lastMessageAt: toMs(nowIso),
    created_at: nowIso,
    last_message_at: nowIso,
  };
}

/** Cập nhật tên và avatar cho nhóm chat */
export async function updateGroupInfo(
  groupId: string,
  name: string,
  avatarUrl: string | null
): Promise<boolean> {
  const sb = getSb();
  if (!sb || !groupId) return false;

  const { error } = await sb
    .from('conversations')
    .update({ name, avatar_url: avatarUrl })
    .eq('id', groupId);

  if (error) {
    console.error('[chat-service] updateGroupInfo failed:', error.message);
    return false;
  }
  return true;
}

/* ============================================================
   REALTIME
   ============================================================ */

export interface RealtimeCallbacks {
  onMessageReceived: (msg: Message) => void;
  onStatusUpdated: (update: StatusUpdate) => void;
  onConversationChanged?: (
    conv: Conversation,
    action: RealtimeAction
  ) => void;
}

let _channel: RealtimeChannel | null = null;

export function subscribeToRealtime(
  onMessageReceived: RealtimeCallbacks['onMessageReceived'],
  onStatusUpdated: RealtimeCallbacks['onStatusUpdated'],
  onConversationChanged?: RealtimeCallbacks['onConversationChanged']
): void {
  const sb = getSb();
  if (!sb || _channel) return;

  const myId = getCurrentUserId();

  _channel = sb
    .channel('fpc_chat_realtime_v15')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload) => {
        const raw = payload.new as DbMessage | null;
        if (!raw) return;
        onMessageReceived(mapDbMessage(raw));
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages' },
      (payload) => {
        const raw = payload.new as DbMessage | null;
        if (!raw) return;
        onStatusUpdated({
          id: raw.id,
          conversation_id: raw.conversation_id,
          status: (raw.status ?? 'sent') as MessageStatus,
        });
      }
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'conversations' },
      (payload) => {
        if (!onConversationChanged) return;
        const raw = payload.new as DbConversation | null;
        if (!raw) return;
        const isMember =
          raw.type === 'channel' ||
          (Array.isArray(raw.members) && raw.members.includes(myId ?? ''));
        if (!isMember) return;
        onConversationChanged(mapDbConversation(raw, myId), 'insert');
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'conversations' },
      (payload) => {
        if (!onConversationChanged) return;
        const raw = payload.new as DbConversation | null;
        if (!raw) return;
        onConversationChanged(mapDbConversation(raw, myId), 'update');
      }
    )
    .subscribe((status) => {
      console.log('[chat-service] Realtime status:', status);
    });
}

export function unsubscribeRealtime(): void {
  const sb = getSb();
  if (_channel && sb) {
    void sb.removeChannel(_channel);
    _channel = null;
    console.log('[chat-service] Realtime channel removed');
  }
}
