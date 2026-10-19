// src/core/auth.ts
import { supabase } from './supabase'; // File này bạn đã có ở T4
import type { AuthState, UserProfile } from '../types';

export const Auth: AuthState = {
  user: null,
  profile: null,
  isSuperAdmin: false,
  isClubAdmin: false,
  initialized: false,
};

// Hàm điều hướng sau khi đăng nhập (Port từ v14)
async function routeAfterLogin(user: any) {
  if (!user) return;
  Auth.user = user;

  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (error) throw error;

    Auth.profile = profile as UserProfile;
    
    // Đọc role từ DB - Nguồn chân lý duy nhất
    const dbRole = Auth.profile?.role || 'member';
    const dbStatus = Auth.profile?.approval_status || 'pending';

    Auth.isSuperAdmin = (dbRole === 'super_admin' && dbStatus === 'active');
    Auth.isClubAdmin = (dbRole === 'admin' && dbStatus === 'active');

    console.log('🚦 Routing user:', { email: user.email, dbRole, dbStatus });

    // TODO: Xử lý UI hiển thị (sẽ làm ở Bước 3)
    return { dbRole, dbStatus };

  } catch (err) {
    console.error('Route error:', err);
    throw err;
  }
}

// 1. Hàm Đăng nhập
export async function handleLogin(email: string, password: string) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    
    // Gọi hàm phân quyền sau khi login thành công
    return await routeAfterLogin(data.user);
  } catch (err: any) {
    let msg = err.message || 'Đăng nhập thất bại';
    if (msg.toLowerCase().includes('invalid')) msg = 'Email hoặc mật khẩu không đúng';
    if (msg.toLowerCase().includes('not confirmed')) msg = 'Email chưa xác nhận';
    throw new Error(msg);
  }
}

// 2. Hàm Đăng ký
export async function handleRegister(name: string, email: string, password: string) {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: name } }
    });
    if (error) throw error;

    if (data.user && !data.session) {
      return { type: 'verify_email', message: 'Vui lòng kiểm tra email để xác nhận.' };
    }

    if (data.session) {
      await routeAfterLogin(data.user);
      return { type: 'success', message: 'Đăng ký thành công!' };
    }
  } catch (err: any) {
    let msg = err.message || 'Không thể đăng ký';
    if (msg.toLowerCase().includes('already')) msg = 'Email này đã được đăng ký';
    throw new Error(msg);
  }
}

// 3. Hàm Đăng xuất
export async function handleLogout() {
  try {
    await supabase.auth.signOut();
    Auth.user = null;
    Auth.profile = null;
    Auth.isSuperAdmin = false;
    Auth.isClubAdmin = false;
    // Xóa token lưu trong localStorage (nếu có dùng)
    localStorage.removeItem('fpc-hub-auth-token');
  } catch (err) {
    console.error('Logout error:', err);
  }
}

// 4. Lắng nghe trạng thái Auth
export function initAuthListener(onStateChange: (event: string, session: any) => void) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      Auth.user = null;
      Auth.profile = null;
    }
    onStateChange(event, session);
  });
}
