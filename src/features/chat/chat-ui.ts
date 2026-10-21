/* ============================================================
   FPC LAB · src/features/chat/chat-ui.ts
   Pure DOM render + event binding cho Chat.
   Port từ v14 `05a-render.js`. KHÔNG gọi Supabase trực tiếp.
   ============================================================ */

import { $, $$, el, clear, escHtml, debounce } from '../../utils';
import type {
  ChatUIHandlers,
  ChatUser,
  Conversation,
  ConvTab,
  Message,
  MessageStatus,
} from './types';

export const CONV_COLORS: Record<string, string> = {
  pink: 'from-pink-500 to-rose-500',
  violet: 'from-violet-500 to-purple-500',
  cyan: 'from-cyan-500 to-blue-500',
  amber: 'from-amber-500 to-orange-500',
  emerald: 'from-emerald-500 to-teal-500',
  indigo: 'from-indigo-500 to-violet-500',
};

/* ============================================================
   HELPERS
   ============================================================ */

function getUserById(users: ChatUser[], id: string | undefined): ChatUser | null {
  if (!id) return null;
  return users.find((u) => u.id === id) ?? null;
}

function getPeer(conv: Conversation, users: ChatUser[], myId: string): ChatUser | null {
  if (conv.type !== 'dm') return null;
  const peerId = conv.members.find((id) => id !== myId) ?? conv.peerId;
  const peer = getUserById(users, peerId);
  if (peer) return peer;
  return {
    id: peerId ?? 'unknown',
    name: conv.name || 'Người dùng',
    initial: (conv.name?.[0] ?? '?').toUpperCase(),
  };
}

function getConvName(conv: Conversation, users: ChatUser[], myId: string): string {
  if (conv.type === 'dm') {
    return getPeer(conv, users, myId)?.name ?? conv.name ?? 'Người dùng';
  }
  return conv.name ?? 'Nhóm';
}

function getConvMembers(conv: Conversation, users: ChatUser[]): ChatUser[] {
  if (conv.type === 'channel') return users;
  if (conv.type === 'dm') return [];
  return conv.members
    .map((id) => getUserById(users, id))
    .filter((u): u is ChatUser => u !== null);
}

function pickAvatarColor(conv: Conversation, fallbackIdx = 0): string {
  const palette = Object.values(CONV_COLORS);
  if (conv.avatarColor && CONV_COLORS[conv.avatarColor]) {
    return CONV_COLORS[conv.avatarColor] as string;
  }
  return palette[fallbackIdx % palette.length] as string;
}

/** Icon DOM thuần (không dùng innerHTML — tuân thủ escHtml rule). */
function statusIcon(status: MessageStatus): HTMLElement {
  const i = document.createElement('i');
  i.className =
    status === 'seen'
      ? 'fa-solid fa-check-double text-cyan-400'
      : status === 'delivered'
        ? 'fa-solid fa-check-double opacity-60'
        : 'fa-solid fa-check opacity-60';
  return i;
}

/* ============================================================
   AVATAR
   ============================================================ */

export function renderConvAvatar(
  conv: Conversation,
  users: ChatUser[],
  myId: string,
  size = 44
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'av-stack';
  if (size !== 44) {
    wrap.style.width = `${size}px`;
    wrap.style.height = `${size}px`;
  }

  if (conv.type === 'channel') {
    const colorClass = pickAvatarColor(conv);
    const inner = document.createElement('div');
    inner.className = `av-1 bg-gradient-to-br ${colorClass}`;
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-hashtag';
    inner.append(icon);
    wrap.append(inner);
    return wrap;
  }

  if (conv.type === 'dm') {
    const peer = getPeer(conv, users, myId);
    const initial = (peer?.initial || peer?.name?.[0] || '?').toUpperCase();
    const colorClass = pickAvatarColor(conv, (peer?.id.charCodeAt(1) || 0) % 3);
    const inner = document.createElement('div');
    inner.className = `av-1 bg-gradient-to-br ${colorClass}`;
    inner.textContent = initial;
    wrap.append(inner);
    if (peer?.status === 'online') {
      const dot = document.createElement('span');
      dot.className =
        'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0a0720]';
      wrap.append(dot);
    }
    return wrap;
  }

  /* group: 4 avatar cells */
  const members = getConvMembers(conv, users).slice(0, 4);
  wrap.classList.add('multi');
  const palette = [
    'from-pink-500 to-rose-500',
    'from-violet-500 to-purple-500',
    'from-cyan-500 to-blue-500',
    'from-amber-500 to-orange-500',
  ];
  members.forEach((m, i) => {
    const cell = document.createElement('div');
    cell.className = `av-cell bg-gradient-to-br ${palette[i % palette.length]}`;
    cell.textContent = m.initial || m.name.charAt(0).toUpperCase();
    wrap.append(cell);
  });
  while (wrap.children.length < 4) {
    const cell = document.createElement('div');
    cell.className = 'av-cell bg-slate-700';
    cell.textContent = '';
    wrap.append(cell);
  }
  return wrap;
}

/* ============================================================
   CONVERSATION LIST
   ============================================================ */

export function renderConvList(
  conversations: Conversation[],
  activeConvId: string | null,
  users: ChatUser[],
  myId: string
): void {
  const list = $('#convList');
  if (!list) return;
  clear(list);

  if (conversations.length === 0) {
    /* Empty state — dùng escHtml cho an toàn (dynamic content tiềm năng). */
    const msg =
      conversations.length === 0
        ? 'Chưa có cuộc trò chuyện nào.'
        : 'Không tìm thấy cuộc trò chuyện.';
    list.innerHTML = `<div class="p-8 text-center text-slate-500 text-xs">${escHtml(msg)}</div>`;
    return;
  }

  const sorted = conversations.slice().sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.lastMessageAt - a.lastMessageAt;
  });

  const pinned = sorted.filter((c) => c.pinned);
  const rest = sorted.filter((c) => !c.pinned);
  const frag = document.createDocumentFragment();

  if (pinned.length > 0) {
    frag.append(el('div', { class: 'conv-section', text: 'Đã ghim' }));
    pinned.forEach((c) => frag.append(renderConvItem(c, activeConvId, users, myId)));
  }
  if (rest.length > 0) {
    if (pinned.length > 0) {
      frag.append(el('div', { class: 'conv-section', text: 'Tất cả' }));
    }
    rest.forEach((c) => frag.append(renderConvItem(c, activeConvId, users, myId)));
  }
  list.append(frag);
}

function renderConvItem(
  conv: Conversation,
  activeConvId: string | null,
  users: ChatUser[],
  myId: string
): HTMLElement {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = `conv-item${conv.unread > 0 ? ' unread' : ''}`;
  item.setAttribute('aria-current', String(activeConvId === conv.id));
  item.dataset.action = 'open-conv';
  item.dataset.convId = conv.id;

  const av = renderConvAvatar(conv, users, myId);

  const body = document.createElement('div');
  body.className = 'flex-1 min-w-0';

  const nameRow = document.createElement('div');
  nameRow.className = 'flex items-center gap-1.5';
  const name = document.createElement('span');
  name.className = 'conv-name';
  name.textContent = getConvName(conv, users, myId);
  nameRow.append(name);

  if (conv.pinned) {
    const pin = document.createElement('i');
    pin.className = 'fa-solid fa-thumbtack text-[9px] text-cyan-400 shrink-0';
    nameRow.append(pin);
  }
  if (conv.muted) {
    const mute = document.createElement('i');
    mute.className = 'fa-solid fa-bell-slash text-[9px] text-slate-500 shrink-0';
    nameRow.append(mute);
  }

  const preview = document.createElement('div');
  preview.className = 'conv-preview';
  preview.textContent = 'Chưa có tin nhắn';

  body.append(nameRow, preview);

  const meta = document.createElement('div');
  meta.className = 'conv-meta';
  const time = document.createElement('span');
  time.className = 'conv-time';
  meta.append(time);

  if (conv.unread > 0) {
    const badge = document.createElement('span');
    badge.className = 'conv-badge';
    badge.textContent = conv.unread > 99 ? '99+' : String(conv.unread);
    meta.append(badge);
  }

  item.append(av, body, meta);
  return item;
}

/* ============================================================
   CHAT HEADER
   ============================================================ */

export function renderChatHeader(
  conv: Conversation | null,
  users: ChatUser[],
  myId: string
): void {
  const box = $('#chatHeaderContent');
  if (!box) return;
  clear(box);
  if (!conv) return;

  const av = renderConvAvatar(conv, users, myId, 40);

  const info = document.createElement('div');
  info.className = 'min-w-0 flex-1';

  const name = document.createElement('div');
  name.className = 'font-black text-sm text-white truncate';
  name.textContent = getConvName(conv, users, myId);

  const status = document.createElement('div');
  status.className = 'text-[10px] font-bold truncate';

  if (conv.type === 'dm') {
    const peer = getPeer(conv, users, myId);
    if (peer?.status === 'online') {
      status.className += ' text-emerald-400';
      const dot = document.createElement('span');
      dot.className =
        'inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1';
      status.append(dot, document.createTextNode('Trực tuyến'));
    } else if (peer?.status === 'away') {
      status.className += ' text-amber-400';
      status.textContent = 'Vắng mặt';
    } else {
      status.className += ' text-slate-500';
      status.textContent = 'Ngoại tuyến';
    }
  } else if (conv.type === 'group') {
    status.className += ' text-slate-500';
    status.textContent = `${conv.members.length} thành viên`;
  } else {
    status.className += ' text-slate-500';
    status.textContent = 'Kênh chung · toàn team';
  }

  info.append(name, status);
  box.append(av, info);
}

/* ============================================================
   MESSAGES
   ============================================================ */

export function renderMessages(
  messages: Message[],
  currentUserId: string,
  conv: Conversation | null
): void {
  const list = $('#messageList');
  if (!list) return;
  if (!conv) {
    clear(list);
    return;
  }

  if (messages.length === 0) {
    clear(list);
    const empty = el('div', {
      class:
        'flex-1 flex flex-col items-center justify-center text-center py-10 text-slate-500',
    });
    const circle = el('div', {
      class:
        'w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mb-3',
    });
    const icon = document.createElement('i');
    icon.className = 'fa-regular fa-comments text-2xl opacity-50';
    circle.append(icon);
    empty.append(
      circle,
      el('p', { class: 'text-sm font-bold text-slate-400', text: 'Chưa có tin nhắn' }),
      el('p', { class: 'text-xs mt-1', text: 'Bắt đầu cuộc trò chuyện!' })
    );
    list.append(empty);
    return;
  }

  /* Nếu có empty state → xoá trước khi append. */
  const emptyState = list.querySelector('.flex-1.flex.flex-col.items-center');
  if (emptyState) emptyState.remove();

  const isNearBottom =
    list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  const frag = document.createDocumentFragment();
  let hasNew = false;

  messages.forEach((m, i) => {
    const existing = list.querySelector<HTMLElement>(
      `[data-msg-id="${m.id}"]`
    );
    const isMine = m.senderId === currentUserId;

    if (existing) {
      /* Cập nhật status icon tại chỗ — không re-render toàn bộ. */
      if (isMine) {
        const statusEl = existing.querySelector<HTMLElement>('.msg-status');
        if (statusEl) {
          const current = statusEl.dataset.status;
          if (current !== m.status) {
            statusEl.dataset.status = m.status;
            clear(statusEl);
            statusEl.append(statusIcon(m.status));
          }
        }
      }
      return;
    }

    const row = document.createElement('div');
    row.className = `msg-row${isMine ? ' mine' : ''}`;
    row.dataset.msgId = m.id;

    if (!isMine) {
      const prev = messages[i - 1];
      const showAv = !prev || prev.senderId !== m.senderId;
      if (showAv) {
        const av = document.createElement('div');
        av.className = 'msg-av bg-gradient-to-br from-violet-500 to-purple-500';
        av.textContent = (m.sender_name || '?').charAt(0).toUpperCase();
        row.append(av);
      } else {
        const spacer = document.createElement('div');
        spacer.className = 'w-7 shrink-0';
        row.append(spacer);
      }
    }

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';

    const prev = messages[i - 1];
    const showAuthor =
      !isMine &&
      conv.type !== 'dm' &&
      (!prev || prev.senderId !== m.senderId);
    if (showAuthor) {
      const author = document.createElement('div');
      author.className = 'msg-author';
      author.textContent = m.author || m.sender_name;
      bubble.append(author);
    }

    /* Text content: dùng textContent (an toàn XSS). Nếu buộc phải
       dùng innerHTML thì phải bọc escHtml — nhưng ở đây textContent
       là đủ và chuẩn hơn. */
    bubble.append(document.createTextNode(m.text || ''));

    const time = document.createElement('div');
    time.className = 'msg-time';
    time.textContent = m.time || '';

    if (isMine) {
      const st = document.createElement('span');
      st.className = 'msg-status';
      st.dataset.status = m.status;
      st.append(statusIcon(m.status));
      time.append(st);
    }
    bubble.append(time);

    row.append(bubble);
    frag.append(row);
    hasNew = true;
  });

  if (hasNew) {
    list.append(frag);
    if (isNearBottom) list.scrollTop = list.scrollHeight;
  }
}

/* ============================================================
   UNREAD BADGE (FAB)
   ============================================================ */

export function updateTotalUnread(conversations: Conversation[]): void {
  const total = conversations.reduce((s, c) => s + (c.unread || 0), 0);
  const btn = document.querySelector<HTMLElement>('[data-action="toggle-chat"]');
  if (!btn) return;

  let badge = btn.querySelector<HTMLElement>('.fab-unread');
  if (total > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className =
        'fab-unread absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-cyan-400 text-black text-[10px] font-black border-2 border-[#030014] flex items-center justify-center';
      btn.append(badge);
    }
    badge.textContent = total > 99 ? '99+' : String(total);
  } else if (badge) {
    badge.remove();
  }
}

/* ============================================================
   EVENT BINDING
   ============================================================ */

/**
 * Gắn toàn bộ DOM event listener cho chat panel.
 * Idempotent-safe: dùng `data-bound` attribute để tránh bind trùng.
 */
export function bindChatEvents(handlers: ChatUIHandlers): void {
  /* ---- Conversation list (event delegation) ---- */
  const convList = $('#convList');
  if (convList && convList.dataset.bound !== '1') {
    convList.dataset.bound = '1';
    convList.addEventListener('click', (e) => {
      const target = e.target as Element | null;
      const item = target?.closest<HTMLElement>('[data-conv-id]');
      const convId = item?.dataset.convId;
      if (convId) handlers.onOpenConversation(convId);
    });
  }

  /* ---- Search input (debounced) ---- */
  const searchInput = $('#convSearch') as HTMLInputElement | null;
  if (searchInput && searchInput.dataset.bound !== '1') {
    searchInput.dataset.bound = '1';
    const debounced = debounce(() => {
      handlers.onSearchChange(searchInput.value.trim());
    }, 200);
    searchInput.addEventListener('input', debounced);
  }

  /* ---- Tabs ---- */
  if (!document.body.dataset.chatTabsBound) {
    document.body.dataset.chatTabsBound = '1';
    $$<HTMLElement>('.conv-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const value = tab.getAttribute('data-conv-tab') as ConvTab | null;
        if (value) handlers.onTabChange(value);
      });
    });
  }

  /* ---- Message form submit ---- */
  const form = $('#messageForm') as HTMLFormElement | null;
  if (form && form.dataset.bound !== '1') {
    form.dataset.bound = '1';
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#messageInput') as HTMLTextAreaElement | null;
      if (!input) return;
      const text = input.value.trim();
      if (!text) return;
      handlers.onSendMessage(text);
      input.value = '';
      input.style.height = 'auto';
    });
  }

  /* ---- Enter (không Shift) trong textarea ---- */
  const input = $('#messageInput') as HTMLTextAreaElement | null;
  if (input && input.dataset.bound !== '1') {
    input.dataset.bound = '1';
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form?.requestSubmit();
      }
    });
  }

  /* ---- Global [data-action] — attach 1 lần ---- */
  if (!document.body.dataset.chatActionsBound) {
    document.body.dataset.chatActionsBound = '1';
    document.addEventListener('click', (e) => {
      const target = e.target as Element | null;
      if (!target) return;

      const toggleChat = target.closest('[data-action="toggle-chat"]');
      if (toggleChat) {
        handlers.onToggleChat();
        return;
      }

      const backBtn = target.closest('[data-action="chat-back"]');
      if (backBtn) {
        handlers.onBackToList();
        return;
      }

      const pinBtn = target.closest<HTMLElement>('[data-action="toggle-pin"]');
      if (pinBtn?.dataset.convId) {
        handlers.onTogglePin(pinBtn.dataset.convId);
        return;
      }

      const muteBtn = target.closest<HTMLElement>('[data-action="toggle-mute"]');
      if (muteBtn?.dataset.convId) {
        handlers.onToggleMute(muteBtn.dataset.convId);
        return;
      }

      const infoBtn = target.closest<HTMLElement>('[data-action="open-chat-info"]');
      if (infoBtn) {
        handlers.onOpenInfo(infoBtn);
        return;
      }

      const groupBtn = target.closest<HTMLElement>(
        '[data-action="create-group"], [data-action="open-create-group"]'
      );
      if (groupBtn) {
        handlers.onCreateGroup(groupBtn);
        return;
      }

      const dmBtn = target.closest<HTMLElement>(
        '[data-action="open-dm"], [data-action="chat-user"], [data-action="dm-user"]'
      );
      if (dmBtn) {
        const uid = dmBtn.dataset.userId ?? dmBtn.dataset.id;
        if (uid) handlers.onOpenDM(uid);
      }
    });
  }
}
