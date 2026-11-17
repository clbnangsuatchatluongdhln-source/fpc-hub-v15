-- ============================================================
-- FPC HUB v16 · 0005_tasks_workflow_files.up.sql
-- Bổ sung các bảng v15 dùng nhưng CHƯA có migration:
--   subtasks, submissions, task_submissions, task_history, files
-- Idempotent: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS
-- ============================================================

BEGIN;

-- 1. SUBTASKS
CREATE TABLE IF NOT EXISTS public.subtasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  assignee_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  deadline      DATE,
  order_index   INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'todo'
                CHECK (status IN ('todo', 'doing', 'submitted', 'scored')),
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  submitted_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON public.subtasks(task_id, order_index);

-- 2. SUBMISSIONS
CREATE TABLE IF NOT EXISTS public.submissions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subtask_id       UUID NOT NULL REFERENCES public.subtasks(id) ON DELETE CASCADE,
  member_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_url         TEXT NOT NULL,
  file_name        TEXT NOT NULL,
  file_size        BIGINT NOT NULL DEFAULT 0,
  note             TEXT,
  is_rejected      BOOLEAN NOT NULL DEFAULT FALSE,
  is_late          BOOLEAN NOT NULL DEFAULT FALSE,
  late_days        INTEGER NOT NULL DEFAULT 0,
  score            NUMERIC(4,1),
  contribution_pct NUMERIC(5,2),
  head_note        TEXT,
  scored_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  scored_at        TIMESTAMPTZ,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_submissions_subtask ON public.submissions(subtask_id);
CREATE INDEX IF NOT EXISTS idx_submissions_member  ON public.submissions(member_id);

-- 3. TASK_SUBMISSIONS
CREATE TABLE IF NOT EXISTS public.task_submissions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id        UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  head_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  final_files    JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary        TEXT NOT NULL DEFAULT '',
  scoreboard     JSONB NOT NULL DEFAULT '[]'::jsonb,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
  president_note TEXT,
  reject_reason  TEXT,
  reviewed_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at    TIMESTAMPTZ,
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_submissions_task ON public.task_submissions(task_id);

-- 4. TASK_HISTORY
CREATE TABLE IF NOT EXISTS public.task_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  actor_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  old_status  TEXT,
  new_status  TEXT,
  note        TEXT NOT NULL DEFAULT '',
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_history_task ON public.task_history(task_id, created_at DESC);

-- 5. FILES (Kho tài nguyên)
CREATE TABLE IF NOT EXISTS public.files (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  size         BIGINT NOT NULL DEFAULT 0,
  mime_type    TEXT,
  uploaded_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_files_created ON public.files(created_at DESC);

-- 6. TRIGGERS updated_at
DROP TRIGGER IF EXISTS trg_subtasks_touch ON public.subtasks;
CREATE TRIGGER trg_subtasks_touch BEFORE UPDATE ON public.subtasks
FOR EACH ROW EXECUTE FUNCTION public.touch_row();

-- 7. BẬT RLS
ALTER TABLE public.subtasks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_submissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files             ENABLE ROW LEVEL SECURITY;

-- 8. POLICIES — SUBTASKS
DROP POLICY IF EXISTS "subtasks_select" ON public.subtasks;
CREATE POLICY "subtasks_select" ON public.subtasks FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "subtasks_insert" ON public.subtasks;
CREATE POLICY "subtasks_insert" ON public.subtasks FOR INSERT TO authenticated WITH CHECK (public.is_club_admin() OR created_by = auth.uid());
DROP POLICY IF EXISTS "subtasks_update" ON public.subtasks;
CREATE POLICY "subtasks_update" ON public.subtasks FOR UPDATE TO authenticated
  USING (public.is_club_admin() OR assignee_id = auth.uid() OR created_by = auth.uid())
  WITH CHECK (public.is_club_admin() OR assignee_id = auth.uid() OR created_by = auth.uid());
DROP POLICY IF EXISTS "subtasks_delete" ON public.subtasks;
CREATE POLICY "subtasks_delete" ON public.subtasks FOR DELETE TO authenticated USING (public.is_club_admin() OR created_by = auth.uid());

-- 9. POLICIES — SUBMISSIONS
DROP POLICY IF EXISTS "submissions_select" ON public.submissions;
CREATE POLICY "submissions_select" ON public.submissions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "submissions_insert" ON public.submissions;
CREATE POLICY "submissions_insert" ON public.submissions FOR INSERT TO authenticated WITH CHECK (member_id = auth.uid());
DROP POLICY IF EXISTS "submissions_update" ON public.submissions;
CREATE POLICY "submissions_update" ON public.submissions FOR UPDATE TO authenticated USING (public.is_club_admin()) WITH CHECK (public.is_club_admin());
DROP POLICY IF EXISTS "submissions_delete" ON public.submissions;
CREATE POLICY "submissions_delete" ON public.submissions FOR DELETE TO authenticated USING (public.is_club_admin());

-- 10. POLICIES — TASK_SUBMISSIONS
DROP POLICY IF EXISTS "task_submissions_select" ON public.task_submissions;
CREATE POLICY "task_submissions_select" ON public.task_submissions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "task_submissions_insert" ON public.task_submissions;
CREATE POLICY "task_submissions_insert" ON public.task_submissions FOR INSERT TO authenticated WITH CHECK (head_id = auth.uid());
DROP POLICY IF EXISTS "task_submissions_update" ON public.task_submissions;
CREATE POLICY "task_submissions_update" ON public.task_submissions FOR UPDATE TO authenticated USING (public.is_club_admin()) WITH CHECK (public.is_club_admin());

-- 11. POLICIES — TASK_HISTORY
DROP POLICY IF EXISTS "task_history_select" ON public.task_history;
CREATE POLICY "task_history_select" ON public.task_history FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "task_history_insert" ON public.task_history;
CREATE POLICY "task_history_insert" ON public.task_history FOR INSERT TO authenticated WITH CHECK (true);

-- 12. POLICIES — FILES
DROP POLICY IF EXISTS "files_select" ON public.files;
CREATE POLICY "files_select" ON public.files FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "files_insert" ON public.files;
CREATE POLICY "files_insert" ON public.files FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid() OR uploaded_by IS NULL);
DROP POLICY IF EXISTS "files_delete" ON public.files;
CREATE POLICY "files_delete" ON public.files FOR DELETE TO authenticated USING (public.is_club_admin() OR uploaded_by = auth.uid());

-- 13. Ghi nhận
INSERT INTO public.schema_migrations (version, name, applied_by)
VALUES ('0005', 'tasks_workflow_files', 'manual')
ON CONFLICT (version) DO NOTHING;

COMMIT;
