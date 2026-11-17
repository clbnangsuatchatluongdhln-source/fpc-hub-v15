import { describe, expect, it } from 'vitest';
import { STATUS_ORDER, checkCanUpdateStatus } from './status-monotonic';
import type { MessageStatus } from '../types';

const ALL: MessageStatus[] = ['sending', 'sent', 'delivered', 'seen', 'failed'];

describe('STATUS_ORDER', () => {
  it('has rank for every status', () => {
    for (const s of ALL) expect(typeof STATUS_ORDER[s]).toBe('number');
  });

  it('keeps monotonic progression sending < sent < delivered < seen', () => {
    expect(STATUS_ORDER.sending).toBeLessThan(STATUS_ORDER.sent);
    expect(STATUS_ORDER.sent).toBeLessThan(STATUS_ORDER.delivered);
    expect(STATUS_ORDER.delivered).toBeLessThan(STATUS_ORDER.seen);
  });

  it('places failed below sending', () => {
    expect(STATUS_ORDER.failed).toBeLessThan(STATUS_ORDER.sending);
  });
});

describe('checkCanUpdateStatus - matrix 25 cap', () => {
  for (const oldStatus of ALL) {
    for (const newStatus of ALL) {
      const expected = STATUS_ORDER[newStatus] > STATUS_ORDER[oldStatus];
      it(`${oldStatus} -> ${newStatus} = ${expected}`, () => {
        expect(checkCanUpdateStatus(oldStatus, newStatus)).toBe(expected);
      });
    }
  }
});

describe('checkCanUpdateStatus - key cases', () => {
  it('blocks downgrade seen -> delivered', () => {
    expect(checkCanUpdateStatus('seen', 'delivered')).toBe(false);
  });

  it('blocks downgrade delivered -> sent', () => {
    expect(checkCanUpdateStatus('delivered', 'sent')).toBe(false);
  });

  it('blocks same status', () => {
    expect(checkCanUpdateStatus('sent', 'sent')).toBe(false);
  });

  it('allows failed -> any non-failed (recovery)', () => {
    for (const s of ALL) {
      if (s === 'failed') continue;
      expect(checkCanUpdateStatus('failed', s)).toBe(true);
    }
  });

  it('allows failed -> sending retry', () => {
    expect(checkCanUpdateStatus('failed', 'sending')).toBe(true);
  });

  it('allows happy path sending -> sent -> delivered -> seen', () => {
    expect(checkCanUpdateStatus('sending', 'sent')).toBe(true);
    expect(checkCanUpdateStatus('sent', 'delivered')).toBe(true);
    expect(checkCanUpdateStatus('delivered', 'seen')).toBe(true);
  });
});
