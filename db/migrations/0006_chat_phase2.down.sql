-- ============================================================
-- FPC HUB v15 · 0006_chat_phase2.down.sql
-- Rollback Phase 2 chat.
--
-- CẢNH BÁO: rollback sẽ mất data của 3 bảng mới + cột mới trên messages.
-- Chỉ chạy khi thực sự cần quay lại 0003.
-- ============================================================

BEGIN;

-- 1. Gỡ 3 bảng mới khỏi realtime publication
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'message_reactions') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.message_reactions;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.notifications;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversation_states') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.conversation_states;
  END IF;
END $$;

-- 2. Drop 3 bảng mới (CASCADE xóa luôn index/policy/trigger đi kèm)
DROP TABLE IF EXISTS public.message_reactions CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.conversation_states CASCADE;

-- 3. Drop cột Phase 2 trên messages
DROP INDEX IF EXISTS public.idx_messages_search_tsv;
DROP INDEX IF EXISTS public.idx_messages_conv_created_desc;
DROP INDEX IF EXISTS public.uniq_messages_client_id;
DROP INDEX IF EXISTS public.uniq_messages_server_id;

ALTER TABLE public.messages DROP COLUMN IF EXISTS search_tsv;
ALTER TABLE public.messages DROP COLUMN IF EXISTS seen_at;
ALTER TABLE public.messages DROP COLUMN IF EXISTS delivered_at;
ALTER TABLE public.messages DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE public.messages DROP COLUMN IF EXISTS edited_at;
ALTER TABLE public.messages DROP COLUMN IF EXISTS is_edited;
ALTER TABLE public.messages DROP COLUMN IF EXISTS system_event_type;
ALTER TABLE public.messages DROP COLUMN IF EXISTS mentions;
ALTER TABLE public.messages DROP COLUMN IF EXISTS forwarded_from_id;
ALTER TABLE public.messages DROP COLUMN IF EXISTS reply_to_id;
ALTER TABLE public.messages DROP COLUMN IF EXISTS content;
ALTER TABLE public.messages DROP COLUMN IF EXISTS type;
ALTER TABLE public.messages DROP COLUMN IF EXISTS server_id;
ALTER TABLE public.messages DROP COLUMN IF EXISTS client_id;

-- 4. Khôi phục CHECK status cũ
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_status_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_status_check
  CHECK (status IN ('sent','delivered','seen'));

-- 5. Ghi nhận rollback
DELETE FROM public.schema_migrations WHERE version = '0006';

COMMIT;
