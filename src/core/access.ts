export type ClubPosition = 'president' | 'vice_president' | null;

export function canManageClub(profile: {
  role?: string; approval_status?: string; club_position?: unknown;
} | null | undefined): boolean {
  return profile?.approval_status === 'active' && (
    profile.role === 'super_admin' || profile.role === 'admin'
    || profile.club_position === 'president' || profile.club_position === 'vice_president'
  );
}

export function canPublishConversation(scope: string | undefined,
  profile: Parameters<typeof canManageClub>[0]): boolean {
  return profile?.approval_status === 'active' && (scope !== 'club' || canManageClub(profile));
}
