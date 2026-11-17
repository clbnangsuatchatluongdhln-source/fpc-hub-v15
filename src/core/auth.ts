// src/core/auth.ts
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { AuthFlowResult, AuthState, UserProfile } from '../types';
import { canManageClub } from './access';

export const Auth: AuthState = {
  user: null,
  profile: null,
  isSuperAdmin: false,
  isClubAdmin: false,
  initialized: false,
};

let loadSeq = 0;
let lastAppliedSeq = 0;

const PROFILE_TIMEOUT_MS = 8_000;
const PROFILE_MAX_ATTEMPTS = 3;
const PROFILE_BASE_DELAY_MS = 300;

async function fetchProfileOnce(userId: string): Promise<UserProfile | null> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`profiles.fetch timeout sau ${PROFILE_TIMEOUT_MS}ms`)),
      PROFILE_TIMEOUT_MS,
    );
  });

  // FIX build error TS2339: PostgrestBuilder (thenable của Supabase) không có
  // .catch() trực tiếp. Bọc trong async IIFE để trả về Promise thật.
  const queryPromise = (async () => {
    return await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
  })();

  // Suppress rejection nếu timeout thắng race (query vẫn chạy ngầm).
  queryPromise.catch(() => undefined);

  try {
    const { data, error } = await Promise.race([queryPromise, timeoutPromise]);
    if (error) throw error;
    return (data as UserProfile | null) ?? null;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

async function fetchProfileWithRetry(
  userId: string,
  maxAttempts = PROFILE_MAX_ATTEMPTS,
): Promise<UserProfile | null> {
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const profile = await fetchProfileOnce(userId);
      if (profile || attempt === maxAttempts) return profile;
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts) throw err;
      console.warn(`[auth] profile fetch attempt ${attempt} failed:`, err);
    }
    const delay = PROFILE_BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 100;
    await new Promise((r) => setTimeout(r, delay));
  }

  if (lastErr) throw lastErr;
  return null;
}

export async function applySession(user: User | null): Promise<boolean> {
  const seq = ++loadSeq;

  if (!user) {
    lastAppliedSeq = seq;
    Auth.user = null;
    Auth.profile = null;
    Auth.isSuperAdmin = false;
    Auth.isClubAdmin = false;
    Auth.initialized = true;
    return true;
  }

  try {
    const profile = await fetchProfileWithRetry(user.id);

    if (seq <= lastAppliedSeq) {
      console.info('[auth] discard stale applySession', { seq, lastAppliedSeq });
      return false;
    }
    lastAppliedSeq = seq;

    Auth.user = user;
    Auth.profile = profile;
    Auth.isSuperAdmin =
      profile?.role === 'super_admin' && profile?.approval_status === 'active';
    Auth.isClubAdmin = canManageClub(profile);
    Auth.initialized = true;

    console.info('🚦 auth applied', {
      uid: user.id,
      role: profile?.role ?? 'member',
      status: profile?.approval_status ?? 'pending',
      v: profile?.version,
    });
    return true;
  } catch (err) {
    if (seq <= lastAppliedSeq) return false;
    lastAppliedSeq = seq;

    Auth.user = user;
    Auth.profile = null;
    Auth.isSuperAdmin = false;
    Auth.isClubAdmin = false;
    Auth.initialized = true;
    throw err;
  }
}

export async function handleLogin(
  email: string,
  password: string,
): Promise<AuthFlowResult> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.user) throw new Error('Supabase không trả user sau khi đăng nhập');

    if (!(Auth.user?.id === data.user.id && Auth.initialized)) {
      await applySession(data.user);
    }
    return { type: 'success', message: 'Đăng nhập thành công!' };
  } catch (err: unknown) {
    throw normalizeAuthError(err, 'Đăng nhập thất bại');
  }
}

export async function handleRegister(
  name: string,
  email: string,
  password: string,
): Promise<AuthFlowResult> {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: name } },
    });
    if (error) throw error;

    if (data.user && !data.session) {
      return {
        type: 'verify_email',
        message: 'Vui lòng kiểm tra email để xác nhận tài khoản.',
      };
    }
    if (data.session && data.user) {
      await applySession(data.user);
      return { type: 'success', message: 'Đăng ký thành công!' };
    }
    return { type: 'success', message: 'Đăng ký thành công!' };
  } catch (err: unknown) {
    throw normalizeAuthError(err, 'Không thể đăng ký');
  }
}

export async function handleLogout(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch (err: unknown) {
    console.error('[auth] signOut error:', err);
  } finally {
    await applySession(null);
    try { localStorage.removeItem('fpc-hub-auth-token'); } catch { /* ignore */ }
  }
}

export type AuthListenerCallback = (
  event: AuthChangeEvent,
  session: Session | null,
) => void | Promise<void>;

const REFETCH_EVENTS: ReadonlySet<AuthChangeEvent> = new Set<AuthChangeEvent>([
  'INITIAL_SESSION',
  'SIGNED_IN',
  'SIGNED_OUT',
  'PASSWORD_RECOVERY',
]);

export function initAuthListener(onStateChange: AuthListenerCallback): void {
  supabase.auth.onAuthStateChange((event, session) => {
    setTimeout(() => {
      Promise.resolve(handleAuthEvent(event, session))
        .then(() => onStateChange(event, session))
        .catch((err: unknown) => console.error('[auth] listener error:', err));
    }, 0);
  });
}

async function handleAuthEvent(
  event: AuthChangeEvent,
  session: Session | null,
): Promise<void> {
  if (event === 'SIGNED_OUT' || !session?.user) {
    await applySession(null);
    return;
  }
  if (REFETCH_EVENTS.has(event)) {
    await applySession(session.user);
    return;
  }
}

function normalizeAuthError(err: unknown, fallback: string): Error {
  const raw = err instanceof Error ? err.message : '';
  let msg = raw || fallback;
  const lower = msg.toLowerCase();
  if (lower.includes('invalid')) msg = 'Email hoặc mật khẩu không đúng';
  else if (lower.includes('not confirmed')) msg = 'Email chưa xác nhận';
  else if (lower.includes('already')) msg = 'Email này đã được đăng ký';
  return new Error(msg);
}
