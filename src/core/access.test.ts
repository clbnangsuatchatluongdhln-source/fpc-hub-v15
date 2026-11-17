import { describe, expect, it } from 'vitest';
import { canManageClub, canPublishConversation } from './access';

describe('club management and announcement access', () => {
  it.each(['super_admin', 'admin'])('allows active %s', role => {
    expect(canManageClub({ role, approval_status: 'active' })).toBe(true);
  });
  it.each(['president', 'vice_president'])('allows club position %s without granting an admin role', club_position => {
    expect(canManageClub({ role: 'member', club_position, approval_status: 'active' })).toBe(true);
  });
  it('does not confuse department leadership with club leadership', () => {
    expect(canManageClub({ role: 'member', club_position: 'head', approval_status: 'active' })).toBe(false);
    expect(canManageClub({ role: 'admin', approval_status: 'pending' })).toBe(false);
    expect(canManageClub(null)).toBe(false);
  });
  it('makes club announcements read-only to members while retaining direct chat', () => {
    const member = { role: 'member', approval_status: 'active' };
    expect(canPublishConversation('club', member)).toBe(false);
    expect(canPublishConversation('direct', member)).toBe(true);
    expect(canPublishConversation('department', member)).toBe(true);
  });
});
