/* ============================================================
   FPC LAB · src/features/chat/index.ts
   Public API + Orchestration layer cho Chat Module.
   ============================================================ */

import { Auth } from '../../core/auth';
import { $ } from '../../utils';
import { Toast } from '../../ui/toast';
import {
  bindChatEvents,
  renderChatHeader,
  renderConvList,
  renderMessages,
  updateTotalUnread,
} from './chat-ui';
import {
  createGroup,
  fetchConversations,
  fetchUsers,
  getOrCreateDM,
  markConversationAsSeen,
  subscribeToRealtime,
  toggleConvMute,
  toggleConvPin,
  unsubscribeRealtime,
  updateMessageStatus,
} from './chat-service';
import {
  sendMessage,
} from './service/messages';
import { checkCanUpdateStatus } from './sync/status-monotonic';
import { canPublishConversation } from '../../core/access';
import { mountNotificationCenter } from './notifications/center-ui';
import { readOutbox, startOutbox, writeOutbox } from './sync/offline-queue';
import { fetchIncremental, fetchMessageStatuses, mergeMessages, newestCursor, type MessageCursor } from './sync/incremental';
import { openGroupSettings } from './group-settings';
import { initChatDrag } from './chat-drag'; // Import tính năng mới
import type {
  ChatState,
  ChatUIHandlers,
  Conversation,
  ConvTab,
  Message,
  RealtimeAction,
} from './types';

/* ============================================================
   MODULE-SCOPED STATE
   ============================================================ */

const state: ChatState = {
  conversations: [],
  messagesByConv: {},
  activeConvId: null,
  convSearch: '',
  convTab: 'all',
  users: [],
  initialized: false,
};

let destroyNotifications: (() => void) | null = null;
let outbox: ReturnType<typeof startOutbox> | null = null;
let sessionRevision = 0;
let stopIncremental: (() => void) | null = null;
const cursors = new Map<string, MessageCursor | null>();

function startIncremental(userId: string, revision: number): () => void {
  let running = false;
  let stopped = false;
  const current = () => !stopped && revision === sessionRevision && getMyId() === userId;
  const sync = async () => {
    if (running || !current() || !navigator.onLine) return;
    running = true;
    try {
      const conversations = await fetchConversations();
      if (!current()) return;
      state.conversations = conversations.map(conversation => ({ ...conversation,
        unread: findConv(conversation.id)?.unread ?? conversation.unread }));
      for (const conversation of conversations) {
        const messages = await fetchIncremental(conversation.id, cursors.get(conversation.id) ?? null);
        if (!current()) return;
        state.messagesByConv[conversation.id] = mergeMessages(
          state.messagesByConv[conversation.id] ?? [], messages);
        const cursor = newestCursor(messages);
        if (cursor) cursors.set(conversation.id, cursor);
      }
      const pendingIds = Object.values(state.messagesByConv).flat().filter(message =>
        message.senderId === userId && (message.status === 'sent' || message.status === 'delivered'))
        .map(message => message.id);
      const statuses = await fetchMessageStatuses(pendingIds);
      if (!current()) return;
      for (const status of statuses) handleRealtimeStatus(status);
      renderAll();
    } catch {
      if (current()) console.warn('[chat] Đồng bộ chưa hoàn tất, sẽ thử lại.');
    } finally { running = false; }
  };
  const resume = () => { if (document.visibilityState === 'visible') void sync(); };
  window.addEventListener('online', resume);
  window.addEventListener('focus', resume);
  document.addEventListener('visibilitychange', resume);
  const timer = window.setInterval(resume, 60000);
  void sync();
  return () => {
    stopped = true;
    clearInterval(timer);
    window.removeEventListener('online', resume);
    window.removeEventListener('focus', resume);
    document.removeEventListener('visibilitychange', resume);
  };
}

/* ============================================================
   HELPERS
   ============================================================ */

function getMyId(): string {
  return Auth.user?.id ?? '';
}

function findConv(convId: string | null): Conversation | null {
  if (!convId) return null;
  return state.conversations.find((c) => c.id === convId) ?? null;
}

function isChatOpen(): boolean {
  const panel = $('#chatPanel');
  return panel?.dataset.open === 'true';
}

function filteredConversations(): Conversation[] {
  let list = state.conversations.slice();
  const q = state.convSearch.toLowerCase().trim();
  if (q) {
    list = list.filter((c) => {
      const name =
        c.type === 'dm'
          ? state.users.find(
              (u) => u.id === (c.members.find((id) => id !== getMyId()) ?? c.peerId)
            )?.name ?? c.name ?? ''
          : c.name ?? '';
      return name.toLowerCase().includes(q);
    });
  }
  if (state.convTab === 'unread') list = list.filter((c) => c.unread > 0);
  if (state.convTab === 'group') {
    list = list.filter((c) => c.type === 'group' || c.type === 'channel');
  }
  return list;
}

function renderAll(): void {
  renderConvList(filteredConversations(), state.activeConvId, state.users, getMyId());
  renderChatHeader(findConv(state.activeConvId), state.users, getMyId());
  renderMessages(
    state.activeConvId ? state.messagesByConv[state.activeConvId] ?? [] : [],
    getMyId(),
    findConv(state.activeConvId)
  );
  updateTotalUnread(state.conversations);
  const activeConversation = findConv(state.activeConvId);
  const readOnly = !activeConversation || !canPublishConversation(activeConversation.scope, Auth.profile);
  const input = document.getElementById('messageInput') as HTMLTextAreaElement | null;
  if (input) {
    input.disabled = readOnly;
    input.placeholder = readOnly ? 'Thông báo CLB · chỉ lãnh đạo được đăng' : 'Nhập tin nhắn…';
  }
  document.querySelectorAll<HTMLButtonElement>('#messageForm button')
    .forEach(button => button.disabled = readOnly);
}

function syncTabUI(): void {
  document.querySelectorAll<HTMLElement>('.conv-tab').forEach((tab) => {
    const value = tab.getAttribute('data-conv-tab');
    tab.classList.toggle('active', value === state.convTab);
  });
}

/* ============================================================
   ORCHESTRATION ACTIONS
   ============================================================ */

async function openConversation(convId: string): Promise<void> {
  const conv = findConv(convId);
  if (!conv) return;

  state.activeConvId = convId;
  state.conversations = state.conversations.map((c) =>
    c.id === convId ? { ...c, unread: 0 } : c
  );

  const panel = $('#chatPanel');
  if (panel) {
    panel.dataset.open = 'true';
    panel.dataset.mobileView = 'chat';
    panel.classList.remove('hidden');
  }

  renderAll();

  if (!state.messagesByConv[convId]) {
    const revision = sessionRevision;
    const msgs = await fetchIncremental(convId, null);
    if (revision !== sessionRevision) return;
    state.messagesByConv[convId] = mergeMessages(state.messagesByConv[convId] ?? [], msgs);
    cursors.set(convId, newestCursor(msgs));
    if (state.activeConvId === convId) {
      renderMessages(state.messagesByConv[convId], getMyId(), conv);
    }
  }

  void markConversationAsSeen(convId);
}

async function handleSendMessage(text: string): Promise<void> {
  if (!canPublishConversation(findConv(state.activeConvId)?.scope, Auth.profile)) {
    Toast.show('Chỉ lãnh đạo CLB được đăng thông báo chung.', { type: 'info' });
    return;
  }
  if (!state.activeConvId || !text.trim()) return;
  const convId = state.activeConvId;
  const userId = getMyId();
  const row = { clientId: crypto.randomUUID(), userId, conversationId: convId,
    input: { type: 'text' as const, content: { text } }, createdAt: new Date().toISOString() };
  try { await writeOutbox(row); }
  catch {
    Toast.show('Không lưu được tin chờ gửi. Vui lòng sao chép và gửi lại: ' + text,
      { type: 'error', timeout: 10000 });
    return;
  }
  if (getMyId() !== userId || !state.initialized) return;
  const msg: Message = { id: row.clientId, clientId: row.clientId, conversation_id: convId,
    senderId: userId, sender_name: Auth.profile?.display_name || 'Bạn', text,
    type: 'text', content: { text }, status: 'sending', isEdited: false,
    created_at: row.createdAt, at: Date.parse(row.createdAt) };
  if (!state.messagesByConv[convId]) state.messagesByConv[convId] = [];
  if (!state.messagesByConv[convId]!.some((m) => m.id === msg.id)) {
    state.messagesByConv[convId]!.push(msg);
  }
  state.conversations = state.conversations.map((c) =>
    c.id === convId ? { ...c, lastMessageAt: msg.at ?? Date.now() } : c
  );
  renderAll();
  void outbox?.flush();
}

/* ============================================================
   REALTIME HANDLERS
   ============================================================ */

function handleRealtimeMessage(msg: Message): void {
  const convId = msg.conversation_id;
  const myId = getMyId();
  const isMine = msg.senderId === myId;

  if (isMine) {
    const arr = state.messagesByConv[convId] ?? [];
    const index = arr.findIndex(m => m.id === msg.id || m.clientId === msg.clientId);
    if (index >= 0) {
      const existing = arr[index]!;
      arr[index] = { ...msg, status: checkCanUpdateStatus(msg.status, existing.status)
        ? existing.status : msg.status };
      renderAll();
      return;
    }
    (state.messagesByConv[convId] ??= []).push(msg);
    renderAll();
    return;
  }

  if (!state.messagesByConv[convId]) state.messagesByConv[convId] = [];
  const arr = state.messagesByConv[convId]!;
  if (arr.some((m) => m.id === msg.id)) return;

  const isActive = state.activeConvId === convId && isChatOpen()
    && document.visibilityState === 'visible' && document.hasFocus();
  const finalStatus = isActive ? 'seen' : 'delivered';
  const storedMsg: Message = { ...msg, status: finalStatus };
  arr.push(storedMsg);

  state.conversations = state.conversations.map((c) =>
    c.id === convId
      ? {
          ...c,
          lastMessageAt: storedMsg.at ?? Date.now(),
          unread: isActive ? 0 : (c.unread || 0) + 1,
        }
      : c
  );

  renderConvList(filteredConversations(), state.activeConvId, state.users, myId);
  updateTotalUnread(state.conversations);

  if (isActive) {
    renderMessages(arr, myId, findConv(convId));
    void updateMessageStatus(msg.id, 'seen');
  } else {
    void updateMessageStatus(msg.id, 'delivered');
    if (!isMine && !findConv(convId)?.muted) Toast.show(`${msg.sender_name}: ${msg.text.slice(0, 50)}`, {
      type: 'info',
      timeout: 3500,
    });
  }
}

function handleRealtimeStatus(update: {
  id: string;
  conversation_id: string;
  status: Message['status'];
}): void {
  const arr = state.messagesByConv[update.conversation_id];
  if (!arr) return;
  const idx = arr.findIndex((m) => m.id === update.id);
  if (idx === -1) return;
  const existing = arr[idx];
  if (!existing || !checkCanUpdateStatus(existing.status, update.status)) return;

  arr[idx] = { ...existing, status: update.status };

  if (state.activeConvId === update.conversation_id && isChatOpen()) {
    renderMessages(arr, getMyId(), findConv(update.conversation_id));
  }
}

function handleRealtimeConversation(
  conv: Conversation,
  action: RealtimeAction
): void {
  if (action === 'insert') {
    if (state.conversations.some((c) => c.id === conv.id)) return;
    state.conversations = [conv, ...state.conversations];
  } else if (action === 'state') {
    state.conversations = state.conversations.map((c) =>
      c.id === conv.id
        ? { ...c, pinned: conv.pinned, muted: conv.muted }
        : c
    );
  } else {
    state.conversations = state.conversations.map((c) =>
      c.id === conv.id
        ? {
            ...c,
            name: conv.name ?? c.name,
            avatar_url: conv.avatar_url ?? c.avatar_url, // Cập nhật realtime avatar
            lastMessageAt: conv.lastMessageAt || c.lastMessageAt,
          }
        : c
    );
  }
  renderConvList(filteredConversations(), state.activeConvId, state.users, getMyId());
  renderChatHeader(findConv(state.activeConvId), state.users, getMyId());
}

/* ============================================================
   PUBLIC ACTIONS
   ============================================================ */

export function openChat(): void {
  const panel = $('#chatPanel');
  if (!panel) return;
  panel.dataset.open = 'true';
  panel.classList.remove('hidden');

  if (!state.activeConvId && state.conversations.length > 0) {
    void openConversation(state.conversations[0]!.id).then(() => initChatDrag());
  } else if (state.activeConvId) {
    renderAll();
    void markConversationAsSeen(state.activeConvId);
    initChatDrag();
  } else {
    initChatDrag();
  }
}

export function closeChat(): void {
  const panel = $('#chatPanel');
  if (!panel) return;
  panel.dataset.open = 'false';
  panel.dataset.mobileView = 'list';
}

function toggleChat(): void {
  const panel = $('#chatPanel');
  if (panel?.dataset.open === 'true') closeChat();
  else openChat();
}

export async function openDMWithUser(userId: string): Promise<void> {
  const myId = getMyId();
  if (!userId || userId === myId) return;

  const conv = await getOrCreateDM(userId);
  if (!conv) {
    Toast.show('⚠️ Không thể tạo cuộc trò chuyện', { type: 'error' });
    return;
  }
  if (!state.conversations.some((c) => c.id === conv.id)) {
    state.conversations = [conv, ...state.conversations];
  }
  await openConversation(conv.id);
}

async function handleCreateGroup(): Promise<void> {
  const name = window.prompt('Tên nhóm:');
  if (!name) return;

  const candidates = state.users
    .filter((u) => u.id !== getMyId())
    .slice(0, 2)
    .map((u) => u.id);
  if (candidates.length < 2) {
    Toast.show('Cần ít nhất 2 thành viên để tạo nhóm', { type: 'error' });
    return;
  }

  const conv = await createGroup(name, candidates);
  if (!conv) {
    Toast.show('⚠️ Không thể tạo nhóm', { type: 'error' });
    return;
  }
  state.conversations = [conv, ...state.conversations];
  await openConversation(conv.id);
}

async function handleTogglePin(convId: string): Promise<void> {
  const conv = findConv(convId);
  if (!conv) return;
  const pinned = !conv.pinned;
  state.conversations = state.conversations.map((c) =>
    c.id === convId ? { ...c, pinned } : c
  );
  renderConvList(filteredConversations(), state.activeConvId, state.users, getMyId());
  Toast.show(pinned ? 'Đã ghim cuộc trò chuyện' : 'Đã bỏ ghim', { type: 'success', timeout: 2000 });
  await toggleConvPin(convId, pinned);
}

async function handleToggleMute(convId: string): Promise<void> {
  const conv = findConv(convId);
  if (!conv) return;
  const muted = !conv.muted;
  state.conversations = state.conversations.map((c) =>
    c.id === convId ? { ...c, muted } : c
  );
  renderConvList(filteredConversations(), state.activeConvId, state.users, getMyId());
  Toast.show(muted ? 'Đã tắt thông báo' : 'Đã bật thông báo', { type: 'success', timeout: 2000 });
  await toggleConvMute(convId, muted);
}

/* ============================================================
   INIT
   ============================================================ */

export async function initChatFeature(): Promise<void> {
  if (state.initialized) return;
  const myId = getMyId();
  if (!Auth.user || !myId) {
    console.warn('[chat] initChatFeature skipped: Auth chưa sẵn sàng');
    return;
  }
  state.initialized = true;
  const revision = ++sessionRevision;
  console.log('🚀 [chat] initChatFeature for user:', myId);

  const handlers: ChatUIHandlers = {
    onOpenConversation: (convId) => void openConversation(convId),
    onSendMessage: (text) => void handleSendMessage(text),
    onSearchChange: (query) => {
      state.convSearch = query;
      renderConvList(filteredConversations(), state.activeConvId, state.users, myId);
    },
    onTabChange: (tab: ConvTab) => {
      state.convTab = tab;
      syncTabUI();
      renderConvList(filteredConversations(), state.activeConvId, state.users, myId);
    },
    onToggleChat: toggleChat,
    onBackToList: () => {
      const panel = $('#chatPanel');
      if (panel) panel.dataset.mobileView = 'list';
    },
    onTogglePin: (convId) => void handleTogglePin(convId),
    onToggleMute: (convId) => void handleToggleMute(convId),
    
    // CẬP NHẬT XỬ LÝ MỞ CÀI ĐẶT NHÓM
    onOpenInfo: () => {
      const conv = findConv(state.activeConvId);
      if (!conv || conv.type !== 'group' || conv.scope === 'department') {
        Toast.show('Chỉ có thể cài đặt cho nhóm', { type: 'info' });
        return;
      }
      openGroupSettings(
        conv.id, 
        conv.name || 'Nhóm', 
        conv.avatar_url || null, 
        (newName, newAvatarUrl) => {
          state.conversations = state.conversations.map(c => 
            c.id === conv.id ? { ...c, name: newName, avatar_url: newAvatarUrl } : c
          );
          renderAll();
        }
      );
    },
    onCreateGroup: () => void handleCreateGroup(),
    onOpenDM: (userId) => void openDMWithUser(userId),
  };
  bindChatEvents(handlers);

  const users = await fetchUsers();
  if (revision !== sessionRevision || getMyId() !== myId) return;
  state.users = users.map((u) => ({
    ...u,
    isMe: u.id === myId,
    status: 'offline' as const,
  }));

  const convs = await fetchConversations();
  if (revision !== sessionRevision || getMyId() !== myId) return;
  state.conversations = convs;

  if (convs.length > 0) {
    try {
      for (const conversation of convs) {
        const messages = await fetchIncremental(conversation.id, null);
        if (revision !== sessionRevision || getMyId() !== myId) return;
        state.messagesByConv[conversation.id] = mergeMessages(
          state.messagesByConv[conversation.id] ?? [], messages);
        cursors.set(conversation.id, newestCursor(messages));
      }
    } catch {
      if (revision !== sessionRevision || getMyId() !== myId) return;
      Toast.show('Chưa tải đủ lịch sử chat. Sẽ thử đồng bộ lại khi có kết nối.', { type: 'warn' });
    }
    state.activeConvId = convs[0]?.id ?? null;
  }

  if (revision !== sessionRevision || getMyId() !== myId) return;
  try {
    const queued = await readOutbox(myId);
    if (revision !== sessionRevision || getMyId() !== myId) return;
    for (const row of queued) {
      if (revision !== sessionRevision || getMyId() !== myId) return;
      const messages = state.messagesByConv[row.conversationId] ??= [];
      if (messages.some(message => message.clientId === row.clientId)) continue;
      messages.push({ id: row.clientId, clientId: row.clientId,
        conversation_id: row.conversationId, senderId: myId,
        sender_name: Auth.profile?.display_name || 'Bạn', text: 'text' in row.input.content
          ? row.input.content.text : '', type: row.input.type, content: row.input.content,
        status: 'sending', isEdited: false, created_at: row.createdAt, at: Date.parse(row.createdAt) });
    }
    outbox = startOutbox(myId, () => getMyId() === myId && revision === sessionRevision,
      row => sendMessage(row.conversationId, row.input,
        { clientId: row.clientId, createdAt: row.createdAt }),
      message => handleRealtimeMessage(message),
      () => Toast.show('Chưa đọc được tin chờ gửi. Sẽ tự thử lại.', { type: 'warn' }));
    void outbox.flush();
  } catch {
    if (revision !== sessionRevision || getMyId() !== myId) return;
    Toast.show('Trình duyệt không mở được bộ nhớ tin chờ gửi.', { type: 'error' });
  }

  renderAll();
  syncTabUI();

  destroyNotifications = mountNotificationCenter(myId, async convId => {
    if (!findConv(convId)) {
      const conversations = await fetchConversations();
      if (revision !== sessionRevision || getMyId() !== myId) return;
      state.conversations = conversations;
    }
    if (!findConv(convId)) throw new Error('Cuộc trò chuyện không còn khả dụng');
    await openConversation(convId);
  }, convId => state.activeConvId === convId && isChatOpen()
    && document.visibilityState === 'visible' && document.hasFocus());

  subscribeToRealtime(
    handleRealtimeMessage,
    handleRealtimeStatus,
    handleRealtimeConversation
  );
  stopIncremental = startIncremental(myId, revision);
}

export function destroyChatFeature(): void {
  sessionRevision++;
  stopIncremental?.();
  stopIncremental = null;
  cursors.clear();
  outbox?.stop();
  outbox = null;
  destroyNotifications?.();
  destroyNotifications = null;
  unsubscribeRealtime();
  state.conversations = [];
  state.messagesByConv = {};
  state.activeConvId = null;
  state.users = [];
  state.initialized = false;
  state.convSearch = '';
  state.convTab = 'all';
  closeChat();
  console.log('[chat] destroyChatFeature done');
}
