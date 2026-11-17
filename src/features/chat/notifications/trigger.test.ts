import { describe, expect, it } from 'vitest';
import { buildNotifications, notificationType, type NotificationMessage } from './trigger';

const message: NotificationMessage = { id: 'm1', conversation_id: 'c1', sender_id: 'sender',
  sender_name: '<script>', text: 'hello', type: 'text', mentions: [] };

describe('notification routing', () => {
  it('never notifies the sender or system messages', () => {
    expect(notificationType(message, 'sender')).toBeNull();
    expect(notificationType({ ...message, type: 'system' }, 'other')).toBeNull();
    expect(notificationType({ ...message, sender_id: null }, 'other')).toBeNull();
  });
  it('mute takes precedence over mentions', () => {
    expect(notificationType({ ...message, mentions: ['other'] }, 'other',
      { user_id: 'other', is_muted: true, is_archived: false })).toBeNull();
  });
  it('archived conversations notify only for mentions', () => {
    const state = { user_id: 'other', is_muted: false, is_archived: true };
    expect(notificationType(message, 'other', state)).toBeNull();
    expect(notificationType({ ...message, mentions: ['all'] }, 'other', state)).toBe('mention_all');
    expect(notificationType({ ...message, mentions: ['other', 'all'] }, 'other', state)).toBe('mention');
  });
  it('deduplicates recipients and limits previews', () => {
    const rows = buildNotifications({ ...message, text: 'x'.repeat(500) },
      ['sender', 'other', 'other'], []);
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toHaveLength(240);
    expect(rows[0].user_id).toBe('other');
    expect(rows[0].type).toBe('message');
  });
});
