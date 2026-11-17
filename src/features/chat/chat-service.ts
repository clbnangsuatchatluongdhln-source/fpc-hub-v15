/* ============================================================
   FPC LAB · src/features/chat/chat-service.ts
   Supabase data access + Realtime subscription cho Chat Module.
   ============================================================ */

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { Auth } from '../../core/auth';
import { mapDbMessageV2 } from './service/messages';
import type {
  Conversation,
  ConversationState,
  ConversationType,
  DbConversation,
  DbConversationState,
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

function toMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function mapDbConversation(
  c: DbConversation,
  currentUserId: string | null,
  state?: ConversationState
): Conversation {
  const members = Array.isArray(c.members) ? c.members : [];
  const peerId = members.find((id) => id !== currentUserId) ?? c.peer_id ?? undefined;
  return {
    id: c.id,
    scope: c.scope ?? (c.type === 'channel' ? 'club' : c.type === 'dm' ? 'direct' : 'group'),
    departmentId: c.department_id,
    type: c.type,
    name: c.name ?? undefined,
    avatar_url: c.avatar_url ?? undefined,
    avatarColor: c.avatar_color ?? DEFAULT_AVATAR_COLOR,
    members,
    peerId,
    pinned: state?.isPinned ?? Boolean(c.pinned),
    muted: state?.isMuted ?? Boolean(c.muted),
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

  const [convRes, stateRes, membershipRes] = await Promise.all([
    sb.from('conversations').select('*').order('last_message_at', { ascending: false }),
    sb
      .from('conversation_states')
      .select('conversation_id, is_pinned, is_muted, is_archived, version')
      .eq('user_id', myId),
    sb.from('department_members').select('department_id').eq('user_id', myId),
  ]);

  if (convRes.error) {
    console.warn('[chat-service] fetchConversations error:', convRes.error.message);
    return [];
  }

  const stateMap = new Map<string, ConversationState>();
  for (const s of (stateRes.data ?? []) as DbConversationState[]) {
    stateMap.set(s.conversation_id, {
      conversationId: s.conversation_id,
      isPinned: s.is_pinned,
      isMuted: s.is_muted,
      isArchived: s.is_archived,
      version: s.version,
    });
  }

  const rows = (convRes.data ?? []) as DbConversation[];
  const departmentIds = new Set((membershipRes.data ?? []).map(row => row.department_id as string));
  return rows.filter(c => c.scope === 'department'
    ? Boolean(c.department_id && departmentIds.has(c.department_id))
    : c.scope === 'club' || (!c.scope && c.type === 'channel') || c.members?.includes(myId))
    .map((c) => mapDbConversation(c, myId, stateMap.get(c.id)));
}

export async function fetchUsers(): Promise<
  { id: string; name: string; email?: string; role?: string; initial: string }[]
> {
  const sb = getSb();
  if (!sb) return [];
  const { data, error } = await sb.from('profiles_public').select('*');
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
  const myId = getCurrentUserId();
  if (!sb || !myId || !convId) return;
  const { error } = await sb
    .from('conversation_states')
    .upsert(
      { user_id: myId, conversation_id: convId, is_pinned: pinned },
      { onConflict: 'user_id,conversation_id' }
    );
  if (error) console.warn('[chat-service] toggleConvPin error:', error.message);
}

export async function toggleConvMute(
  convId: string,
  muted: boolean
): Promise<void> {
  const sb = getSb();
  const myId = getCurrentUserId();
  if (!sb || !myId || !convId) return;
  const { error } = await sb
    .from('conversation_states')
    .upsert(
      { user_id: myId, conversation_id: convId, is_muted: muted },
      { onConflict: 'user_id,conversation_id' }
    );
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
      scope: 'direct',
      peer_id: userId,
      members,
      created_by: myId,
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
    scope: 'direct',
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
    scope: 'group',
    name: trimmedName,
    avatar_color: 'violet',
    members: allMembers,
    created_by: myId,
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
    client_id: uuid(),
    type: 'system',
    content: { event: 'group_created' },
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
        onMessageReceived(mapDbMessageV2(raw));
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
        void fetchConversations().then(conversations => {
          const conversation = conversations.find(item => item.id === raw.id);
          if (conversation && getCurrentUserId() === myId) onConversationChanged(conversation, 'insert');
        });
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'conversations' },
      (payload) => {
        if (!onConversationChanged) return;
        const raw = payload.new as DbConversation | null;
        if (!raw) return;
        void fetchConversations().then(conversations => {
          const conversation = conversations.find(item => item.id === raw.id);
          if (conversation && getCurrentUserId() === myId) onConversationChanged(conversation, 'update');
        });
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'conversation_states',
        filter: `user_id=eq.${myId ?? ''}`,
      },
      (payload) => {
        if (!onConversationChanged) return;
        const raw = payload.new as DbConversationState | null;
        if (!raw) return;
        const stub: Conversation = {
          id: raw.conversation_id,
          type: 'dm' as ConversationType,
          members: [],
          pinned: raw.is_pinned,
          muted: raw.is_muted,
          unread: 0,
          lastMessageAt: 0,
        };
        onConversationChanged(stub, 'state');
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

export {
  sendMessage,
  fetchMessages,
  fetchMessagesBulk,
  mapDbMessageV2,
  deriveText,
} from './service/messages';
export type { SendMessageInput } from './service/messages';
