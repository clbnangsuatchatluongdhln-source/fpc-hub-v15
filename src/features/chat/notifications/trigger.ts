export interface NotificationMessage {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  sender_name: string | null;
  text: string;
  type: string;
  mentions: string[] | null;
}

export interface RecipientState {
  user_id: string;
  is_muted: boolean;
  is_archived: boolean;
}

export function notificationType(message: NotificationMessage, userId: string,
  state?: RecipientState): 'message' | 'mention' | 'mention_all' | null {
  if (!message.sender_id || message.sender_id === userId || state?.is_muted
    || message.type === 'system') return null;
  const mentions = message.mentions ?? [];
  const type = mentions.includes(userId) ? 'mention'
    : mentions.includes('all') ? 'mention_all' : 'message';
  return state?.is_archived && type === 'message' ? null : type;
}

export function buildNotifications(message: NotificationMessage, userIds: string[],
  states: RecipientState[]) {
  const stateByUser = new Map(states.map(state => [state.user_id, state]));
  return [...new Set(userIds)].flatMap(userId => {
    const type = notificationType(message, userId, stateByUser.get(userId));
    return type ? [{ user_id: userId, type, conversation_id: message.conversation_id,
      message_id: message.id, actor_id: message.sender_id,
      title: message.sender_name || 'Tin nhắn mới',
      body: (message.text || 'Bạn có tin nhắn mới').slice(0, 240) }] : [];
  });
}
