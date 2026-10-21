-- ============================================================
-- FPC HUB v15 · 0003_chat_schema.down.sql
-- Rollback chat schema.
-- ============================================================

BEGIN;

-- Gỡ khỏi realtime publication trước
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.messages;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.conversations;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.is_conversation_member(UUID);

DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.conversations CASCADE;

DELETE FROM public.schema_migrations WHERE version = '0003';

COMMIT;
