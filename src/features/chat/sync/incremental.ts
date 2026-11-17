import { supabase } from '../../../core/supabase';
import { mapDbMessageV2 } from '../service/messages';
import type { DbMessage, Message } from '../types';

export interface MessageCursor { createdAt: string; id: string }

export function newestCursor(messages: Message[]): MessageCursor | null {
  let newest: MessageCursor | null = null;
  for (const message of messages) {
    if (message.status === 'sending' || message.status === 'failed') continue;
    const candidate = { createdAt: message.created_at, id: message.id };
    if (!newest || candidate.createdAt > newest.createdAt
      || (candidate.createdAt === newest.createdAt && candidate.id > newest.id)) newest = candidate;
  }
  return newest;
}

export async function fetchIncremental(conversationId: string,
  cursor: MessageCursor | null): Promise<Message[]> {
  const messages: Message[] = [];
  const lowerBound = cursor ? new Date(Date.parse(cursor.createdAt) - 60000).toISOString() : null;
  let pageCursor: MessageCursor | null = null;
  while (true) {
    let query = supabase.from('messages').select('*').eq('conversation_id', conversationId)
      .order('created_at', { ascending: true }).order('id', { ascending: true }).limit(200);
    if (lowerBound) query = query.gte('created_at', lowerBound);
    if (pageCursor) {
      query = query.or(`created_at.gt.${pageCursor.createdAt},and(created_at.eq.${pageCursor.createdAt},id.gt.${pageCursor.id})`);
    }
    const { data, error } = await query;
    if (error) throw error;
    const rows = data as DbMessage[];
    messages.push(...rows.map(mapDbMessageV2));
    if (rows.length < 200) break;
    const last = rows[rows.length - 1]!;
    pageCursor = { createdAt: last.created_at, id: last.id };
  }
  return messages;
}

export function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  const messages = new Map(existing.map(message => [message.id, message]));
  const rank = { failed: -1, sending: 0, sent: 1, delivered: 2, seen: 3 };
  for (const message of incoming) {
    const previous = messages.get(message.id);
    messages.set(message.id, previous && rank[previous.status] > rank[message.status]
      ? { ...message, status: previous.status } : message);
  }
  return [...messages.values()].sort((a, b) => a.created_at.localeCompare(b.created_at)
    || a.id.localeCompare(b.id));
}

export async function fetchMessageStatuses(ids: string[]): Promise<Pick<Message,
  'id' | 'conversation_id' | 'status'>[]> {
  const statuses: Pick<Message, 'id' | 'conversation_id' | 'status'>[] = [];
  for (let offset = 0; offset < ids.length; offset += 200) {
    const { data, error } = await supabase.from('messages').select('id,conversation_id,status')
      .in('id', ids.slice(offset, offset + 200));
    if (error) throw error;
    statuses.push(...data);
  }
  return statuses;
}
