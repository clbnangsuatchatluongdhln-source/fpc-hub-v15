/* ============================================================
   FPC LAB · src/types/index.ts
   ============================================================ */

import type { User } from '@supabase/supabase-js';
import type { Toast as ToastType } from '../ui/toast';
import type { Modal as ModalType } from '../ui/modal';

export type UserRole = 'super_admin' | 'admin' | 'member';
export type ApprovalStatus = 'pending' | 'active' | 'rejected';

export interface UserProfile {
  club_position?: import('../core/access').ClubPosition;
  id: string;
  display_name?: string;
  email?: string;
  role: UserRole;
  approval_status: ApprovalStatus;
  version?: number;
  avatar_url?: string | null; 
  // Chỉ giữ DUY NHẤT 1 dòng index signature này thôi
  [key: string]: unknown; 
}

export interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  isSuperAdmin: boolean;
  isClubAdmin: boolean;
  initialized: boolean;
  clubSettings?: ClubSettings; // Thêm thuộc tính này để dùng cho Avatar CLB
}

export interface ClubSettings {
  club_name: string;
  logo_url?: string | null;
}

export type AuthResultType = 'success' | 'verify_email' | 'error';

export interface AuthFlowResult {
  type: AuthResultType;
  message: string;
}

declare global {
  interface Window {
    escHtml: (str: unknown) => string;
    Toast: typeof ToastType;
    Modal: typeof ModalType;
    FPCReport?: {
      ok: (file: string, message: string) => void;
    };
  }
}

export {};
