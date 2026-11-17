import { supabase } from '../../../core/supabase';
import './notifications.css';

interface ChatNotification {
  id: string;
  title: string | null;
  body: string | null;
  conversation_id: string | null;
  storage_notice_key?:string|null;
  is_read: boolean;
  created_at: string;
}

export function mountNotificationCenter(userId: string,
  openConversation: (id: string) => Promise<void>,
  isFocused: (id: string) => boolean): () => void {
  const host = document.querySelector('#mainAppContainer header');
  if (!host) return () => {};
  let alive = true;
  let loading = false;
  let reload = false;
  let revision = 0;
  const root = document.createElement('div');
  root.className = 'chat-notifications';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.setAttribute('aria-label', 'Thông báo');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.textContent = 'Thông báo';
  const panel = document.createElement('section');
  panel.id = `chat-notifications-${userId}`;
  panel.className = 'chat-notifications-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Trung tâm thông báo');
  toggle.setAttribute('aria-controls', panel.id);
  const markAll = document.createElement('button');
  markAll.type = 'button';
  markAll.textContent = 'Đánh dấu tất cả đã đọc';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const list = document.createElement('div');
  panel.append(markAll, status, list);
  root.append(toggle, panel);
  host.append(root);

  async function markRead(id?: string): Promise<boolean> {
    let query = supabase.from('notifications').update({ is_read: true })
      .eq('user_id', userId).eq('is_read', false);
    if (id) query = query.eq('id', id);
    const { error } = await query;
    if (!alive) return false;
    if (error) { status.textContent = 'Chưa đánh dấu được. Vui lòng thử lại.'; return false; }
    return true;
  }

  async function refresh(): Promise<void> {
    if (!alive) return;
    if (loading) { reload = true; return; }
    loading = true;
    const currentRevision = ++revision;
    const [recent, unread] = await Promise.all([
      supabase.from('notifications').select('id,title,body,conversation_id,is_read,created_at,storage_notice_key')
        .eq('user_id', userId).order('created_at', { ascending: false }).order('id').limit(50),
      supabase.from('notifications').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('is_read', false),
    ]);
    loading = false;
    if (!alive || currentRevision !== revision) return;
    if (recent.error || unread.error) {
      status.textContent = 'Không tải được thông báo. Đóng rồi mở lại để thử.';
    } else {
      toggle.textContent = unread.count ? `Thông báo (${unread.count})` : 'Thông báo';
      markAll.disabled = !unread.count;
      const rows = recent.data as ChatNotification[];
      status.textContent = rows.length === 50 ? '50 thông báo gần nhất'
        : rows.length ? 'Thông báo gần đây' : 'Chưa có thông báo';
      list.replaceChildren();
      for (const row of rows) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = row.is_read ? 'notification-item' : 'notification-item unread';
        const title = document.createElement('strong');
        title.textContent = row.title || 'Tin nhắn mới';
        const body = document.createElement('span');
        body.textContent = row.body || '';
        const time = document.createElement('time');
        time.dateTime = row.created_at;
        time.textContent = new Date(row.created_at).toLocaleString('vi-VN');
        button.append(title, body, time);
        button.onclick = async () => {
          button.disabled = true;
          if (!(await markRead(row.id))) { button.disabled = false; return; }
          if (row.conversation_id) {
            try { await openConversation(row.conversation_id); }
            catch { status.textContent = 'Không mở được cuộc trò chuyện.'; button.disabled = false; return; }
          }
          if(row.storage_notice_key)window.location.hash='/files';
          if (!alive) return;
          panel.hidden = true;
          toggle.setAttribute('aria-expanded', 'false');
          toggle.focus();
          void refresh();
        };
        list.append(button);
      }
    }
    if (reload) { reload = false; void refresh(); }
  }

  toggle.onclick = () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) { status.textContent = 'Đang tải…'; void refresh(); }
  };
  markAll.onclick = async () => { if (await markRead()) void refresh(); };
  const closeOutside = (event: PointerEvent) => {
    if (!root.contains(event.target as Node)) {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    }
  };
  const closeEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !panel.hidden) {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      toggle.focus();
    }
  };
  document.addEventListener('pointerdown', closeOutside);
  document.addEventListener('keydown', closeEscape);
  const channel = supabase.channel(`chat-notifications:${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications',
      filter: `user_id=eq.${userId}` }, async payload => {
      const row = payload.new as ChatNotification;
      if (payload.eventType === 'INSERT' && row.conversation_id && isFocused(row.conversation_id)) {
        await markRead(row.id);
      }
      void refresh();
    }).subscribe(status => { if (status === 'SUBSCRIBED') void refresh(); });
  const onFocus = () => { void refresh(); };
  window.addEventListener('focus', onFocus);
  void refresh();
  return () => {
    alive = false;
    revision++;
    document.removeEventListener('pointerdown', closeOutside);
    document.removeEventListener('keydown', closeEscape);
    window.removeEventListener('focus', onFocus);
    void supabase.removeChannel(channel);
    root.remove();
  };
}
