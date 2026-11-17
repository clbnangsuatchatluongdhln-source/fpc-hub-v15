// api/_lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

function createAdmin() {
  const url=process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !key)throw new Error('Server storage authentication is not configured');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
let admin:ReturnType<typeof createAdmin>|undefined;
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createAdmin>, {
  get(_target,property) {
    if(!admin) {
      admin=createAdmin();
    }
    const value=Reflect.get(admin,property);
    return typeof value==='function'?value.bind(admin):value;
  },
});

export async function verifyUser(authHeader?: string) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export function setCors(res: import('@vercel/node').VercelResponse, origin?:string): boolean {
  const allowed=(process.env.APP_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173').split(',').map(value=>value.trim());
  res.setHeader('Vary','Origin');
  res.setHeader('Cache-Control','no-store');
  if(origin && !allowed.includes(origin))return false;
  if(origin)res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return true;
}
