import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startOutbox, type QueuedMessage } from './offline-queue';
import type { Message } from '../types';

const row: QueuedMessage = { userId: 'u1', clientId: 'stable-id', conversationId: 'c1',
  createdAt: '2026-11-15T10:00:00Z', input: { type: 'text', content: { text: 'hello' } } };
const message = { id: 'stable-id', clientId: 'stable-id' } as Message;

describe('offline outbox lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('window', { setInterval, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  function setup(send = vi.fn<() => Promise<Message | null>>(async () => message), current = () => true) {
    const storage = { read: vi.fn(async () => [row]), remove: vi.fn(async () => {}) };
    const sent = vi.fn();
    const error = vi.fn();
    return { storage, sent, error, send,
      queue: startOutbox('u1', current, send, sent, error, storage) };
  }
  it('retains a failed delivery and reuses its identity on retry', async () => {
    const send = vi.fn<() => Promise<Message | null>>().mockResolvedValueOnce(null).mockResolvedValue(message);
    const { queue, storage, sent } = setup(send);
    await queue.flush();
    expect(storage.remove).not.toHaveBeenCalled();
    await queue.flush();
    expect(send.mock.calls).toHaveLength(2);
    expect(storage.remove).toHaveBeenCalledWith(row);
    expect(sent).toHaveBeenCalledWith(message);
    queue.stop();
  });
  it('does not send while offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const { queue, send } = setup();
    await queue.flush();
    expect(send).not.toHaveBeenCalled();
    queue.stop();
  });
  it('does not acknowledge or remove a pending message after logout', async () => {
    let current = true;
    const send = vi.fn(async () => { current = false; return message; });
    const { queue, storage, sent } = setup(send, () => current);
    await queue.flush();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(sent).not.toHaveBeenCalled();
    queue.stop();
  });
  it('serializes concurrent flushes and stops scheduled work', async () => {
    const { queue, send } = setup();
    await Promise.all([queue.flush(), queue.flush()]);
    expect(send).toHaveBeenCalledTimes(1);
    queue.stop();
    await queue.flush();
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('keeps order in a blocked conversation without blocking other conversations', async () => {
    const send = vi.fn<() => Promise<Message | null>>().mockResolvedValueOnce(null).mockResolvedValue(message);
    const { queue, storage } = setup(send);
    storage.read.mockResolvedValue([row, { ...row, clientId: 'second' },
      { ...row, clientId: 'third', conversationId: 'c2' }]);
    await queue.flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(storage.remove).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'third' }));
    queue.stop();
  });
});
