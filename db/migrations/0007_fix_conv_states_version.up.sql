-- ============================================================
-- FPC HUB v15 · 0007_fix_conv_states_version.up.sql
-- Fix bug: trigger touch_row() yêu cầu cột version, nhưng
-- 0006 tạo bảng conversation_states thiếu cột này.
-- Hệ quả: mọi UPDATE vào conversation_states crash runtime.
-- ============================================================

BEGIN;

ALTER TABLE public.conversation_states
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

INSERT INTO public.schema_migrations (version, name, applied_by)
VALUES ('0007', 'fix_conv_states_version', 'manual')
ON CONFLICT (version) DO NOTHING;

COMMIT;
