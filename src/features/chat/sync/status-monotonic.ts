import type { MessageStatus } from '../types';

export const STATUS_ORDER: Record<MessageStatus, number> = {
  sending: 0,
  sent: 1,
  delivered: 2,
  seen: 3,
  failed: -1,
};

export function checkCanUpdateStatus(
  oldStatus: MessageStatus,
  newStatus: MessageStatus
): boolean {
  const oldRank = STATUS_ORDER[oldStatus];
  const newRank = STATUS_ORDER[newStatus];
  if (oldRank === undefined || newRank === undefined) return false;
  return newRank > oldRank;
}
