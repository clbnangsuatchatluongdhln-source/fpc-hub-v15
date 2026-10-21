/* ============================================================
   FPC LAB · src/features/chat/types.ts
   Định nghĩa toàn bộ domain type cho Chat Module.
   Port từ v14 `05-chat.js` (implicit shapes) → TS explicit.
   ============================================================ */

export type MessageStatus = 'sent' | 'delivered' | 'seen';
export type ConversationType = 'dm' | 'group' | 'channel';
export type ConvTab = 'all' | 'unread' | 'group';
export type RealtimeAction = 'insert' | 'update';
export type PresenceStatus = 'online' | 'away' | 'offline';

/* ---------- DOMAIN MODELS (client-side, camelCase) ---------- */

/** Message trong state client. Map từ DbMessage (snake_case) khi fetch. */
export interface Message {
  id: string;
  conversation_id: string;
  /** Alias camelCase của conversation_id — giữ để tương thích pattern v14. */
  convId?: string;
  senderId: string;
  /** snake_case như spec & payload Supabase. */
  sender_name: string;
  /** Alias v14 (`author`). Nếu vắng, UI fallback sang sender_name. */
  author?: string;
  text: string;
  status: MessageStatus;
  created_at: string; // ISO string
  /** Client-only helpers — tính từ created_at khi fetch/realtime. */
  at?: number;        // timestamp ms
  time?: string;      // "HH:mm" đã format
}

export interface Conversation {
  id: string;
  type: ConversationType;
  name?: string;
  members: string[];
  peerId?: string;
  avatarColor?: string;
  pinned: boolean;
  muted: boolean;
  unread: number;
  lastMessageAt: number; // ms timestamp
  created_at?: string;
  last_message_at?: string;
}

/** User tối thiểu để render avatar / peer name trong DM. */
export interface ChatUser {
  id: string;
  name: string;
  initial?: string;
  email?: string;
  role?: string;
  status?: PresenceStatus;
  isMe?: boolean;
}

/** Toàn bộ state của Chat feature — module-scoped trong index.ts. */
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

/** Handler signature cho UI event binding (không import Supabase ở đây). */
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
