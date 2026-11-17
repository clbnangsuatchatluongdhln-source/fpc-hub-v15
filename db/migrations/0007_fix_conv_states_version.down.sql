-- FPC HUB v15 · 0007_fix_conv_states_version.down.sql
BEGIN;
ALTER TABLE public.conversation_states DROP COLUMN IF EXISTS version;
DELETE FROM public.schema_migrations WHERE version = '0007';
COMMIT;
