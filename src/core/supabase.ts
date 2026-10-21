// src/core/supabase.ts
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error('Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trong .env.local');
}

export const supabase: SupabaseClient = createClient(url, key);

/* ============================================================
   LEGACY BRIDGE — expose Supabase client cho các module
   v14 port sang v15 đọc qua `window.FPC_SUPABASE.client`.
   ============================================================ */
window.FPC_SUPABASE = { client: supabase };
