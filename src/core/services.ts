import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserProfile } from '../types';

export type NotifyType = 'info' | 'error' | 'success' | 'warn';
export type UserRole = 'super_admin' | 'admin' | 'member';

export interface AppEvents {
  emit: (name: string, detail?: unknown) => void;
  on: (name: string, handler: (detail: unknown) => void) => () => void;
}

export interface AppModal {
  open: (id: string, trigger: HTMLElement | null, buildFn: (content: HTMLElement) => void) => void;
  close: (id: string) => void;
  confirm: (message: string) => boolean;
}

export interface AppServices {
  supabase: SupabaseClient;
  userId: string | null;
  getUser: () => UserProfile | null;
  getRole: () => UserRole;
  notify: (msg: string, type?: NotifyType) => void;
  navigate: (path: string) => void;
  events: AppEvents;
  modal: AppModal;
}
