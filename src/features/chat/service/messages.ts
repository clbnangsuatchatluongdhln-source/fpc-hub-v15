import type { SupabaseClient } from '@supabase/supabase-js';
import { Auth } from '../../../core/auth';
import { fmtTime } from '../../../utils';
import type {
  ContentPayload,
  DbMessage,
  Message,
  MessageStatus,
  MessageType,
} from '../types';

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

export function deriveText(type: MessageType, content: ContentPayload): string {
  switch (type) {
    case 'text':
      return (content as { text?: string }).text ?? '';
    case 'media':
      return (content as { caption?: string }).caption ?? '[Media]';
    case 'file':
      return (content as { name?: string }).name || '[File]';
    case 'link': {
      const c = content as { url?: string; title?: string };
      return c.title || c.url || '[Link]';
    }
    case 'sticker':
      return '[Sticker]';
    case 'location': {
      const c = content as { lat?: number; lng?: number; label?: string };
      return c.label || `[${c.lat ?? ''},${c.lng ?? ''}]`;
    }
    case 'card':
      return (content as { title?: string }).title || '[Card]';
    case 'system':
      return (content as { event?: string }).event || '[System]';
    case 'unsupported':
      return (content as { raw?: string }).raw || '[Unsupported]';
    default:
      return '';
  }
}

export function mapDbMessageV2(m: DbMessage): Message {
  const type = (m.type ?? 'text') as MessageType;
  const content = (m.content ?? {}) as ContentPayload;
  return {
    id: m.id,
    conversation_id: m.conversation_id,
    convId: m.conversation_id,
    senderId: m.sender_id ?? '',
    sender_name: m.sender_name ?? 'Thành viên',
    author: m.sender_name ?? 'Thành viên',
    text: m.text || deriveText(type, content),
    status: (m.status ?? 'sent') as MessageStatus,
    created_at: m.created_at,
    at: toMs(m.created_at),
    time: toTimeString(m.created_at),
    type,
    content,
    clientId: m.client_id,
    serverId: m.server_id ?? undefined,
    replyToId: m.reply_to_id ?? undefined,
    mentions: m.mentions ?? undefined,
    isEdited: m.is_edited,
    editedAt: m.edited_at ?? undefined,
    deletedAt: m.deleted_at ?? undefined,
    deliveredAt: m.delivered_at ?? undefined,
    seenAt: m.seen_at ?? undefined,
  };
}

export interface SendMessageInput {
  type: MessageType;
  content: ContentPayload;
  replyToId?: string;
  mentions?: string[];
}

export async function sendMessage(
  convId: string,
  input: SendMessageInput,
  identity?: { clientId: string; createdAt: string }
): Promise<Message | null> {
  const sb = getSb();
  const myId = getCurrentUserId();
  if (!sb || !myId || !convId) return null;

  const type = input.type;
  const content = input.content;
  const text = deriveText(type, content);
  if (type === 'text' && !text.trim()) return null;

  const nowIso = identity?.createdAt ?? new Date().toISOString();
  const clientId = identity?.clientId ?? uuid();
  const id = clientId;
  const senderName = getCurrentUserName();

  const { data: inserted, error } = await sb.from('messages').insert({
    id,
    conversation_id: convId,
    sender_id: myId,
    sender_name: senderName,
    text,
    status: 'sent',
    client_id: clientId,
    type,
    content,
    reply_to_id: input.replyToId ?? null,
    mentions: input.mentions ?? [],
  }).select('*').single();
  if (error) {
    if (error.code === '23505') {
      const { data: existing } = await sb.from('messages').select('*')
        .eq('client_id', clientId).eq('sender_id', myId).eq('conversation_id', convId).single();
      if (existing) return mapDbMessageV2(existing as DbMessage);
    }
    console.error('[service/messages] sendMessage insert failed:', error.message);
    return null;
  }

  if (inserted) return mapDbMessageV2(inserted as DbMessage);
  return {
    id,
    conversation_id: convId,
    convId,
    senderId: myId,
    sender_name: senderName,
    author: senderName,
    text,
    status: 'sent',
    created_at: nowIso,
    at: toMs(nowIso),
    time: toTimeString(nowIso),
    type,
    content,
    clientId,
    replyToId: input.replyToId,
    mentions: input.mentions,
    isEdited: false,
  };
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
    console.warn('[service/messages] fetchMessages error:', error.message);
    return [];
  }
  return ((data ?? []) as DbMessage[]).map(mapDbMessageV2);
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
    (byConv[row.conversation_id] ??= []).push(mapDbMessageV2(row));
  }
  return byConv;
}
