import { supabase } from '../supabase';

export async function storageRequest<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error('Vui lòng đăng nhập để thao tác tệp');
  const response = await fetch(url, { method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify(body) });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(detail.error || `Dịch vụ tệp trả lỗi ${response.status}`);
  }
  return response.json() as Promise<T>;
}
