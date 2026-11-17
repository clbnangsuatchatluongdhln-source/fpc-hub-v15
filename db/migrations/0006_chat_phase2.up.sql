-- ============================================================
-- FPC HUB v15 · 0006_chat_phase2.up.sql
-- Phase 2 "Chat mạnh" — mở rộng messages + 3 bảng mới.
--
-- Đã chạy trên Supabase dev (auqxbigkttrktwsfrdba) 2026-11-05.
-- Idempotent: chạy lại an toàn.
--
-- Phụ thuộc: 0003 (messages, conversations, is_conversation_member).
-- Không đụng FK sender_id (đang trỏ auth.users — giữ nguyên Phase 2,
-- TODO Phase 3+ chuyển sang profiles(id) ON DELETE SET NULL).
-- ============================================================

BEGIN;

-- B.1. Nới lỏng + chuẩn hóa cột messages hiện có
ALTER TABLE public.messages ALTER COLUMN sender_id DROP NOT NULL;
ALTER TABLE public.messages ALTER COLUMN status SET DEFAULT 'sent';
UPDATE public.messages SET status = 'sent' WHERE status IS NULL;
ALTER TABLE public.messages ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.messages ALTER COLUMN created_at SET DEFAULT NOW();
UPDATE public.messages SET created_at = NOW() WHERE created_at IS NULL;
ALTER TABLE public.messages ALTER COLUMN created_at SET NOT NULL;

-- B.2. Đổi CHECK status: thêm sending + failed
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_status_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_status_check
  CHECK (status IN ('sending','sent','delivered','seen','failed'));

-- B.3. Cột Phase 2 trên messages
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS client_id           TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS server_id           TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS type                TEXT NOT NULL DEFAULT 'text';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS content             JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reply_to_id         UUID REFERENCES public.messages(id) ON DELETE SET NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS forwarded_from_id   UUID REFERENCES public.messages(id) ON DELETE SET NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS mentions            JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS system_event_type   TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_edited           BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS edited_at           TIMESTAMPTZ;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted_at          TIMESTAMPTZ;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS delivered_at        TIMESTAMPTZ;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS seen_at             TIMESTAMPTZ;

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_type_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_type_check
  CHECK (type IN ('text','media','file','link','sticker','location','card','system','unsupported'));

-- B.4. Backfill client_id cho row cũ, rồi siết NOT NULL + UNIQUE
UPDATE public.messages SET client_id = id::text WHERE client_id IS NULL;
ALTER TABLE public.messages ALTER COLUMN client_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_messages_client_id ON public.messages(client_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_messages_server_id ON public.messages(server_id) WHERE server_id IS NOT NULL;

-- B.5. FTS generated column + GIN index
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(text, ''))) STORED;
CREATE INDEX IF NOT EXISTS idx_messages_search_tsv ON public.messages USING GIN(search_tsv);
CREATE INDEX IF NOT EXISTS idx_messages_conv_created_desc ON public.messages(conversation_id, created_at DESC);

-- B.6. Bảng conversation_states (per-user)
CREATE TABLE IF NOT EXISTS public.conversation_states (
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id     UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  last_process_msg_id UUID,
  last_seen_msg_id    UUID,
  is_pinned           BOOLEAN NOT NULL DEFAULT FALSE,
  is_muted            BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived         BOOLEAN NOT NULL DEFAULT FALSE,
  last_sync_at        TIMESTAMPTZ,
  sync_cursor         TEXT,
  full_resync_round   INTEGER NOT NULL DEFAULT 0,
  version             INTEGER NOT NULL DEFAULT 1,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, conversation_id)
);
CREATE INDEX IF NOT EXISTS idx_conv_states_conv ON public.conversation_states(conversation_id);

DROP TRIGGER IF EXISTS trg_conversation_states_touch ON public.conversation_states;
CREATE TRIGGER trg_conversation_states_touch BEFORE UPDATE ON public.conversation_states
FOR EACH ROW EXECUTE FUNCTION public.touch_row();

ALTER TABLE public.conversation_states ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "conversation_states_select" ON public.conversation_states;
CREATE POLICY "conversation_states_select" ON public.conversation_states
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "conversation_states_insert" ON public.conversation_states;
CREATE POLICY "conversation_states_insert" ON public.conversation_states
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "conversation_states_update" ON public.conversation_states;
CREATE POLICY "conversation_states_update" ON public.conversation_states
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "conversation_states_delete" ON public.conversation_states;
CREATE POLICY "conversation_states_delete" ON public.conversation_states
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- B.7. Bảng notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('message','mention','mention_all','reaction','system')),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id      UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  actor_id        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  title           TEXT,
  body            TEXT,
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, is_read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "notifications_delete" ON public.notifications;
CREATE POLICY "notifications_delete" ON public.notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (false);

-- B.8. Bảng message_reactions
CREATE TABLE IF NOT EXISTS public.message_reactions (
  message_id  UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_message_reactions_msg ON public.message_reactions(message_id);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "message_reactions_select" ON public.message_reactions;
CREATE POLICY "message_reactions_select" ON public.message_reactions
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id AND public.is_conversation_member(m.conversation_id)
    )
  );
DROP POLICY IF EXISTS "message_reactions_insert" ON public.message_reactions;
CREATE POLICY "message_reactions_insert" ON public.message_reactions
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id AND public.is_conversation_member(m.conversation_id)
    )
  );
DROP POLICY IF EXISTS "message_reactions_delete" ON public.message_reactions;
CREATE POLICY "message_reactions_delete" ON public.message_reactions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- B.9. Realtime publication cho 3 bảng mới
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversation_states') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_states;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'message_reactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
  END IF;
END $$;

-- B.10. Ghi nhận migration
INSERT INTO public.schema_migrations (version, name, applied_by)
VALUES ('0006', 'chat_phase2', 'manual')
ON CONFLICT (version) DO NOTHING;

COMMIT;
