/* ============================================================
   FPC LAB · src/features/chat/types.ts
   Định nghĩa toàn bộ domain type cho Chat Module.
   ============================================================ */

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'seen' | 'failed';
export type MessageType =
  | 'text'
  | 'media'
  | 'file'
  | 'link'
  | 'sticker'
  | 'location'
  | 'card'
  | 'system'
  | 'unsupported';

export interface TextContent {
  text: string;
}
export interface MediaContent {
  url: string;
  mime: string;
  width?: number;
  height?: number;
  caption?: string;
}
export interface FileContent {
  url: string;
  name: string;
  size: number;
  mime: string;
}
export interface LinkContent {
  url: string;
  title?: string;
  description?: string;
  thumbnail?: string;
}
export interface StickerContent {
  packId: string;
  stickerId: string;
}
export interface LocationContent {
  lat: number;
  lng: number;
  label?: string;
}
export interface CardContent {
  title: string;
  subtitle?: string;
  image?: string;
  action?: string;
}
export interface SystemContent {
  event: string;
}
export interface UnsupportedContent {
  raw: string;
}

export type ContentPayload =
  | TextContent
  | MediaContent
  | FileContent
  | LinkContent
  | StickerContent
  | LocationContent
  | CardContent
  | SystemContent
  | UnsupportedContent;
export type ConversationType = 'dm' | 'group' | 'channel';
export type ConvTab = 'all' | 'unread' | 'group';
export type RealtimeAction = 'insert' | 'update' | 'state';
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
  type: MessageType;
  content: ContentPayload;
  clientId: string;
  serverId?: string;
  replyToId?: string;
  mentions?: string[];
  isEdited: boolean;
  editedAt?: string;
  deletedAt?: string;
  deliveredAt?: string;
  seenAt?: string;
}

export interface Conversation {
  scope?: 'direct' | 'group' | 'department' | 'club';
  departmentId?: string | null;
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
  scope?: 'direct' | 'group' | 'department' | 'club';
  department_id?: string | null;
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

export interface ConversationState {
  conversationId: string;
  isPinned: boolean;
  isMuted: boolean;
  isArchived: boolean;
  version: number;
}

export interface DbConversationState {
  user_id: string;
  conversation_id: string;
  is_pinned: boolean;
  is_muted: boolean;
  is_archived: boolean;
  version: number;
}

export interface DbMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string | null;
  text: string;
  status: MessageStatus | null;
  created_at: string;
  client_id: string;
  server_id: string | null;
  type: MessageType;
  content: ContentPayload;
  reply_to_id: string | null;
  forwarded_from_id: string | null;
  mentions: string[] | null;
  system_event_type: string | null;
  is_edited: boolean;
  edited_at: string | null;
  deleted_at: string | null;
  delivered_at: string | null;
  seen_at: string | null;
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
