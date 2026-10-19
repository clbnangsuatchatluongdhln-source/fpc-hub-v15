// src/types/index.ts
export type UserRole = 'super_admin' | 'admin' | 'member' | 'viewer';
export type ApprovalStatus = 'pending' | 'active' | 'rejected';

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  nickname?: string;
  avatar_url?: string;
  avatar_color: string;
  role: UserRole;
  approval_status: ApprovalStatus;
  status: string;
  created_at: string;
}
