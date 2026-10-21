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
  fetchMessages,
  fetchMessagesBulk,
  fetchUsers,
  getOrCreateDM,
  markConversationAsSeen,
  sendMessage,
  subscribeToRealtime,
  toggleConvMute,
  toggleConvPin,
  unsubscribeRealtime,
  updateMessageStatus,
} from './chat-service';
import { openGroupSettings } from './group-settings'; // Import tính năng mới
import type {
  ChatState,
  ChatUIHandlers,
  Conversation,
  ConvTab,
  Message,
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
    const msgs = await fetchMessages(convId);
    state.messagesByConv[convId] = msgs;
    if (state.activeConvId === convId) {
      renderMessages(msgs, getMyId(), conv);
    }
  }

  void markConversationAsSeen(convId);
}

async function handleSendMessage(text: string): Promise<void> {
  if (!state.activeConvId) return;
  const convId = state.activeConvId;
  const msg = await sendMessage(convId, text);
  if (!msg) {
    Toast.show('⚠️ Không lưu được tin nhắn lên cloud', { type: 'warn', timeout: 3000 });
    return;
  }

  if (!state.messagesByConv[convId]) state.messagesByConv[convId] = [];
  if (!state.messagesByConv[convId]!.some((m) => m.id === msg.id)) {
    state.messagesByConv[convId]!.push(msg);
  }
  state.conversations = state.conversations.map((c) =>
    c.id === convId ? { ...c, lastMessageAt: msg.at ?? Date.now() } : c
  );
  renderAll();
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
    if (arr.some((m) => m.id === msg.id)) return;
  }

  if (!state.messagesByConv[convId]) state.messagesByConv[convId] = [];
  const arr = state.messagesByConv[convId]!;
  if (arr.some((m) => m.id === msg.id)) return;

  const isActive = state.activeConvId === convId && isChatOpen();
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
    Toast.show(`${msg.sender_name}: ${msg.text.slice(0, 50)}`, {
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
  if (!existing || existing.status === update.status) return;

  arr[idx] = { ...existing, status: update.status };

  if (state.activeConvId === update.conversation_id && isChatOpen()) {
    renderMessages(arr, getMyId(), findConv(update.conversation_id));
  }
}

function handleRealtimeConversation(
  conv: Conversation,
  action: 'insert' | 'update'
): void {
  if (action === 'insert') {
    if (state.conversations.some((c) => c.id === conv.id)) return;
    state.conversations = [conv, ...state.conversations];
  } else {
    state.conversations = state.conversations.map((c) =>
      c.id === conv.id
        ? {
            ...c,
            name: conv.name ?? c.name,
            avatar_url: conv.avatar_url ?? c.avatar_url, // Cập nhật realtime avatar
            pinned: conv.pinned,
            muted: conv.muted,
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
    void openConversation(state.conversations[0]!.id);
  } else if (state.activeConvId) {
    renderAll();
    void markConversationAsSeen(state.activeConvId);
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
      if (!conv || conv.type !== 'group') {
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
  state.users = users.map((u) => ({
    ...u,
    isMe: u.id === myId,
    status: 'offline' as const,
  }));

  const convs = await fetchConversations();
  state.conversations = convs;

  if (convs.length > 0) {
    const bulkMsgs = await fetchMessagesBulk(convs.map((c) => c.id));
    state.messagesByConv = bulkMsgs;
    state.activeConvId = convs[0]?.id ?? null;
    if (state.activeConvId) void markConversationAsSeen(state.activeConvId);
  }

  renderAll();
  syncTabUI();

  subscribeToRealtime(
    handleRealtimeMessage,
    handleRealtimeStatus,
    handleRealtimeConversation
  );
}

export function destroyChatFeature(): void {
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
