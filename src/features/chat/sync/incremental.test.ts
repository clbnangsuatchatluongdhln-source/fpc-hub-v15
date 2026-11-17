import { describe, expect, it, vi } from 'vitest';
vi.mock('../../../core/supabase', () => ({ supabase: { from: vi.fn() } }));
vi.mock('../service/messages', () => ({ mapDbMessageV2: (message: unknown) => message }));
import { fetchIncremental, mergeMessages, newestCursor } from './incremental';
import { supabase } from '../../../core/supabase';
import type { Message } from '../types';

const makeMessage = (id: string, status: Message['status'] = 'sent',
  created_at = '2026-11-15T10:00:00Z') => ({ id, clientId: id, status, created_at }) as Message;

describe('incremental message reconciliation', () => {
  it('uses id to break equal timestamp ties and excludes unsent messages', () => {
    expect(newestCursor([makeMessage('b'), makeMessage('a'), makeMessage('z', 'sending'),
      makeMessage('zz', 'failed')])).toEqual({ id: 'b', createdAt: '2026-11-15T10:00:00Z' });
  });
  it('deduplicates overlap without lowering acknowledged status', () => {
    const result = mergeMessages([makeMessage('a', 'seen')], [makeMessage('a', 'sent'), makeMessage('b')]);
    expect(result).toHaveLength(2);
    expect(result[0].status).toBe('seen');
  });
  it('replaces optimistic message with server acknowledgement', () => {
    expect(mergeMessages([makeMessage('a', 'sending')], [makeMessage('a')])[0].status).toBe('sent');
  });
  it('paginates with a compound cursor and replays a minute of overlap', async () => {
    const firstPage = Array.from({ length: 200 }, (_, index) => makeMessage(String(index).padStart(4, '0')));
    const queries: Record<string, ReturnType<typeof vi.fn>>[] = [];
    vi.mocked(supabase.from).mockImplementation(() => {
      const result = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(),
        gte: vi.fn(), or: vi.fn(), then: vi.fn() };
      for (const key of ['select', 'eq', 'order', 'limit', 'gte', 'or'] as const) result[key].mockReturnValue(result);
      const data = queries.length ? [makeMessage('0200')] : firstPage;
      result.then.mockImplementation(resolve => Promise.resolve({ data, error: null }).then(resolve));
      queries.push(result);
      return result as unknown as ReturnType<typeof supabase.from>;
    });
    const messages = await fetchIncremental('c1', { id: '0001', createdAt: '2026-11-15T10:00:00Z' });
    expect(messages).toHaveLength(201);
    expect(queries).toHaveLength(2);
    expect(queries[0].gte).toHaveBeenCalledWith('created_at', '2026-11-15T09:59:00.000Z');
    expect(queries[1].or).toHaveBeenCalledWith(
      'created_at.gt.2026-11-15T10:00:00Z,and(created_at.eq.2026-11-15T10:00:00Z,id.gt.0199)');
  });
});
