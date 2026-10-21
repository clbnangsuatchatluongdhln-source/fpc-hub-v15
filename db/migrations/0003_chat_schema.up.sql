-- ============================================================
-- FPC HUB v15 · 0003_chat_schema.up.sql
--
-- Chat Module schema — bảng conversations + messages.
-- Module 3 (Chat Realtime) yêu cầu:
--   - conversations: DM, group, channel
--   - messages: status sent → delivered → seen
--   - Realtime publication cho cả 2 bảng
--
-- RLS: member của conv, HOẶC club_admin/super_admin (đã active).
-- Helper `is_club_admin()` tái sử dụng từ 0001.
--
-- Idempotent: DROP POLICY IF EXISTS + CREATE TABLE IF NOT EXISTS.
-- Nếu migration này đã được chạy thủ công trước đó (raw SQL paste vào
-- SQL Editor), vẫn an toàn vì tất cả lệnh đều idempotent — chỉ cần
-- đảm bảo record trong schema_migrations được thêm vào.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. BẢNG conversations
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL CHECK (type IN ('dm', 'group', 'channel')),
  name            TEXT,
  avatar_color    TEXT DEFAULT 'violet',
  members         UUID[] NOT NULL DEFAULT '{}',
  peer_id         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  pinned          BOOLEAN NOT NULL DEFAULT FALSE,
  muted           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- 2. BẢNG messages
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_name     TEXT,
  text            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'sent'
                  CHECK (status IN ('sent', 'delivered', 'seen')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- 3. INDEX
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_messages_conv_time
  ON public.messages(conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_conversations_last_msg
  ON public.conversations(last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_members
  ON public.conversations USING GIN(members);

-- ────────────────────────────────────────────────────────────
-- 4. Helper: user có phải member của conv X?
--    SECURITY DEFINER để tránh recursion khi dùng trong policy.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_conversation_member(conv_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversations
    WHERE id = conv_id
      AND (type = 'channel' OR auth.uid() = ANY(members))
  );
$$;

REVOKE ALL ON FUNCTION public.is_conversation_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(UUID) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 5. RLS — bật bảo mật
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages      ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 6. POLICIES conversations
--    - channel: mọi authenticated đọc được (kênh chung)
--    - dm/group: chỉ member
--    - admin: đọc tất cả (để admin panel debug)
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "conversations_select" ON public.conversations;
CREATE POLICY "conversations_select" ON public.conversations
  FOR SELECT TO authenticated
  USING (
    public.is_club_admin()
    OR type = 'channel'
    OR auth.uid() = ANY(members)
  );

DROP POLICY IF EXISTS "conversations_insert" ON public.conversations;
CREATE POLICY "conversations_insert" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "conversations_update" ON public.conversations;
CREATE POLICY "conversations_update" ON public.conversations
  FOR UPDATE TO authenticated
  USING (
    public.is_club_admin()
    OR (type <> 'channel' AND auth.uid() = ANY(members))
  )
  WITH CHECK (
    public.is_club_admin()
    OR (type <> 'channel' AND auth.uid() = ANY(members))
  );

DROP POLICY IF EXISTS "conversations_delete" ON public.conversations;
CREATE POLICY "conversations_delete" ON public.conversations
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- ────────────────────────────────────────────────────────────
-- 7. POLICIES messages
--    - SELECT: ai đọc được conv tương ứng
--    - INSERT: chính mình gửi + là member conv
--    - UPDATE: ai trong conv (để mark seen/delivered)
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "messages_select" ON public.messages;
CREATE POLICY "messages_select" ON public.messages
  FOR SELECT TO authenticated
  USING (
    public.is_club_admin()
    OR public.is_conversation_member(conversation_id)
  );

DROP POLICY IF EXISTS "messages_insert" ON public.messages;
CREATE POLICY "messages_insert" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND public.is_conversation_member(conversation_id)
  );

DROP POLICY IF EXISTS "messages_update" ON public.messages;
CREATE POLICY "messages_update" ON public.messages
  FOR UPDATE TO authenticated
  USING (public.is_conversation_member(conversation_id))
  WITH CHECK (public.is_conversation_member(conversation_id));

DROP POLICY IF EXISTS "messages_delete" ON public.messages;
CREATE POLICY "messages_delete" ON public.messages
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- ────────────────────────────────────────────────────────────
-- 8. REALTIME publication
--    Guard: chỉ ADD nếu chưa có (tránh lỗi khi rerun).
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 9. SEED — kênh chung cho mọi user
-- ────────────────────────────────────────────────────────────
INSERT INTO public.conversations (type, name, avatar_color, members, created_by)
VALUES ('channel', 'general', 'violet', '{}', NULL)
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 10. Ghi nhận migration
-- ────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version, name, applied_by)
VALUES ('0003', 'chat_schema', 'manual')
ON CONFLICT (version) DO NOTHING;

COMMIT;
