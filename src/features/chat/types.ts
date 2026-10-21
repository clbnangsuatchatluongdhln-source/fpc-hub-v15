/* ============================================================
   FPC LAB · src/features/chat/types.ts
   Định nghĩa toàn bộ domain type cho Chat Module.
   ============================================================ */

export type MessageStatus = 'sent' | 'delivered' | 'seen';
export type ConversationType = 'dm' | 'group' | 'channel';
export type ConvTab = 'all' | 'unread' | 'group';
export type RealtimeAction = 'insert' | 'update';
export type PresenceStatus = 'online' | 'away' | 'offline';

/* ---------- DOMAIN MODELS (client-side, camelCase) ---------- */

export interface Message {
  id: string;
  conversation_id: string;
  convId?: string;
  senderId: string;
  sender_name: string;
  author?: string;
  text: string;
  status: MessageStatus;
  created_at: string;
  at?: number;
  time?: string;
}

export interface Conversation {
  id: string;
  type: ConversationType;
  name?: string;
  avatar_url?: string | null; // Bổ sung trường Avatar Nhóm
  members: string[];
  peerId?: string;
  avatarColor?: string;
  pinned: boolean;
  muted: boolean;
  unread: number;
  lastMessageAt: number;
  created_at?: string;
  last_message_at?: string;
}

export interface ChatUser {
  id: string;
  name: string;
  initial?: string;
  email?: string;
  role?: string;
  status?: PresenceStatus;
  isMe?: boolean;
}

export interface ChatState {
  conversations: Conversation[];
  messagesByConv: Record<string, Message[]>;
  activeConvId: string | null;
  convSearch: string;
  convTab: ConvTab;
  users: ChatUser[];
  initialized: boolean;
}

/* ---------- RAW DB ROWS (snake_case, cho Supabase) ---------- */

export interface DbConversation {
  id: string;
  type: ConversationType;
  name: string | null;
  avatar_url: string | null; // Bổ sung trường Avatar Nhóm
  avatar_color: string | null;
  members: string[] | null;
  peer_id: string | null;
  pinned: boolean | null;
  muted: boolean | null;
  created_by: string | null;
  created_at: string;
  last_message_at: string | null;
}

export interface DbMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string | null;
  text: string;
  status: MessageStatus | null;
  created_at: string;
}

export interface DbProfile {
  id: string;
  display_name: string | null;
  email: string | null;
  role: string | null;
  approval_status: string | null;
}

/* ---------- REALTIME CALLBACK PAYLOADS ---------- */

export interface StatusUpdate {
  id: string;
  conversation_id: string;
  status: MessageStatus;
}

export interface ChatUIHandlers {
  onOpenConversation: (convId: string) => void;
  onSendMessage: (text: string) => void;
  onSearchChange: (query: string) => void;
  onTabChange: (tab: ConvTab) => void;
  onToggleChat: () => void;
  onBackToList: () => void;
  onTogglePin: (convId: string) => void;
  onToggleMute: (convId: string) => void;
  onOpenInfo: (trigger: HTMLElement) => void;
  onCreateGroup: (trigger: HTMLElement) => void;
  onOpenDM: (userId: string) => void;
}
