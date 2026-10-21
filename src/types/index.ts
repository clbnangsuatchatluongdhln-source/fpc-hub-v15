/* ============================================================
   FPC LAB · src/types/index.ts
   Chứa toàn bộ định nghĩa Type/Interface dùng chung cho dự án.
   ============================================================ */

import type { User } from '@supabase/supabase-js';
import type { Toast as ToastType } from '../ui/toast';
import type { Modal as ModalType } from '../ui/modal';

/* ============================================================
   1. TYPES CHO AUTH & USER (Dùng cho core/auth.ts và main.ts)
   ============================================================ */

export type UserRole = 'super_admin' | 'admin' | 'member';
export type ApprovalStatus = 'pending' | 'active' | 'rejected';

export interface UserProfile {
  id: string;
  display_name?: string;
  email?: string;
  role: UserRole;
  approval_status: ApprovalStatus;
  version?: number;
  created_at?: string;
  updated_at?: string;
  // Cho phép các trường khác từ Supabase trả về mà không bị lỗi strict
  [key: string]: unknown; 
}

export interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  isSuperAdmin: boolean;
  isClubAdmin: boolean;
  initialized: boolean;
}

export type AuthResultType = 'success' | 'verify_email' | 'error';

export interface AuthFlowResult {
  type: AuthResultType;
  message: string;
}

/* ============================================================
   2. GLOBAL DECLARATIONS (Backward Compatibility v14 -> v15)
   Gắn các module ES6 vào window để code cũ có thể gọi.
   ============================================================ */

declare global {
  interface Window {
    // Từ Module 2 (UI Components)
    escHtml: (str: unknown) => string;
    Toast: typeof ToastType;
    Modal: typeof ModalType;

    // Health System (từ v14)
    FPCReport?: {
      ok: (file: string, message: string) => void;
    };
  }
}

// Đảm bảo file này được coi là một module (bắt buộc khi dùng declare global)
export {};
