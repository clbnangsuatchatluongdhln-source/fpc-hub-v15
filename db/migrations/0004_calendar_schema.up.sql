-- ============================================================
-- FPC HUB v15 · 0004_calendar_schema.up.sql
-- Tạo events + projects + project_phases + tasks
-- KHÔNG wrap transaction — để thấy lỗi từng câu khi chạy
-- ============================================================

-- 1. PROJECTS
CREATE TABLE IF NOT EXISTS public.projects (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  description    TEXT,
  tag            TEXT NOT NULL DEFAULT 'Project',
  accent         TEXT NOT NULL DEFAULT 'violet',
  status         TEXT NOT NULL DEFAULT 'active',
  deadline       DATE,
  owner_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  department_id  UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  head_id        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  members        UUID[] NOT NULL DEFAULT '{}',
  progress       INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_department ON public.projects(department_id);
CREATE INDEX IF NOT EXISTS idx_projects_status     ON public.projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_members    ON public.projects USING GIN(members);

-- 2. PROJECT_PHASES
CREATE TABLE IF NOT EXISTS public.project_phases (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  start_date   DATE,
  end_date     DATE,
  order_index  INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_phases_project
  ON public.project_phases(project_id, order_index);

-- 3. TASKS
CREATE TABLE IF NOT EXISTS public.tasks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT NOT NULL,
  description       TEXT,
  requirement       TEXT,
  department_id     UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  project_id        UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  priority          TEXT NOT NULL DEFAULT 'normal'
                    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  start_date        DATE,
  deadline_original DATE,
  deadline_current  DATE,
  status            TEXT NOT NULL DEFAULT 'assigned',
  created_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_to       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_department ON public.tasks(department_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project    ON public.tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline   ON public.tasks(deadline_current);
CREATE INDEX IF NOT EXISTS idx_tasks_status     ON public.tasks(status);

-- 4. EVENTS
CREATE TABLE IF NOT EXISTS public.events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  label          TEXT,
  description    TEXT,
  start_time     TIMESTAMPTZ NOT NULL,
  end_time       TIMESTAMPTZ NOT NULL,
  tone           TEXT NOT NULL DEFAULT 'violet',
  icon           TEXT NOT NULL DEFAULT 'fa-calendar',
  visibility     TEXT NOT NULL DEFAULT 'public'
                 CHECK (visibility IN ('public', 'department', 'private')),
  department_id  UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  project_id     UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  created_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_time >= start_time)
);

CREATE INDEX IF NOT EXISTS idx_events_start      ON public.events(start_time);
CREATE INDEX IF NOT EXISTS idx_events_visibility ON public.events(visibility);
CREATE INDEX IF NOT EXISTS idx_events_department ON public.events(department_id);
CREATE INDEX IF NOT EXISTS idx_events_project    ON public.events(project_id);

-- 5. TRIGGERS updated_at
DROP TRIGGER IF EXISTS trg_projects_touch ON public.projects;
CREATE TRIGGER trg_projects_touch BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.touch_row();

DROP TRIGGER IF EXISTS trg_tasks_touch ON public.tasks;
CREATE TRIGGER trg_tasks_touch BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.touch_row();

DROP TRIGGER IF EXISTS trg_events_touch ON public.events;
CREATE TRIGGER trg_events_touch BEFORE UPDATE ON public.events
FOR EACH ROW EXECUTE FUNCTION public.touch_row();

-- 6. BẬT RLS
ALTER TABLE public.projects       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events         ENABLE ROW LEVEL SECURITY;

-- 7. POLICIES — PROJECTS
DROP POLICY IF EXISTS "projects_select" ON public.projects;
CREATE POLICY "projects_select" ON public.projects
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "projects_insert" ON public.projects;
CREATE POLICY "projects_insert" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id OR public.is_club_admin());

DROP POLICY IF EXISTS "projects_update" ON public.projects;
CREATE POLICY "projects_update" ON public.projects
  FOR UPDATE TO authenticated
  USING (public.is_club_admin() OR auth.uid() = owner_id OR auth.uid() = ANY(members))
  WITH CHECK (public.is_club_admin() OR auth.uid() = owner_id OR auth.uid() = ANY(members));

DROP POLICY IF EXISTS "projects_delete" ON public.projects;
CREATE POLICY "projects_delete" ON public.projects
  FOR DELETE TO authenticated USING (public.is_club_admin());

-- 8. POLICIES — PROJECT_PHASES
DROP POLICY IF EXISTS "project_phases_select" ON public.project_phases;
CREATE POLICY "project_phases_select" ON public.project_phases
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "project_phases_insert" ON public.project_phases;
CREATE POLICY "project_phases_insert" ON public.project_phases
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND (public.is_club_admin() OR auth.uid() = p.owner_id OR auth.uid() = ANY(p.members))
    )
  );

DROP POLICY IF EXISTS "project_phases_update" ON public.project_phases;
CREATE POLICY "project_phases_update" ON public.project_phases
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND (public.is_club_admin() OR auth.uid() = p.owner_id OR auth.uid() = ANY(p.members))
    )
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS "project_phases_delete" ON public.project_phases;
CREATE POLICY "project_phases_delete" ON public.project_phases
  FOR DELETE TO authenticated
  USING (public.is_club_admin() OR auth.uid() IN (
    SELECT p.owner_id FROM public.projects p WHERE p.id = project_id
  ));

-- 9. POLICIES — TASKS
DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
CREATE POLICY "tasks_insert" ON public.tasks
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;
CREATE POLICY "tasks_delete" ON public.tasks
  FOR DELETE TO authenticated USING (public.is_club_admin());

-- 10. POLICIES — EVENTS
DROP POLICY IF EXISTS "events_select" ON public.events;
CREATE POLICY "events_select" ON public.events
  FOR SELECT TO authenticated
  USING (
    public.is_club_admin()
    OR visibility = 'public'
    OR visibility = 'department'
    OR (visibility = 'private' AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS "events_insert" ON public.events;
CREATE POLICY "events_insert" ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

DROP POLICY IF EXISTS "events_update" ON public.events;
CREATE POLICY "events_update" ON public.events
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_club_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_club_admin());

DROP POLICY IF EXISTS "events_delete" ON public.events;
CREATE POLICY "events_delete" ON public.events
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_club_admin());

-- 11. Ghi nhận migration
INSERT INTO public.schema_migrations (version, name, applied_by)
VALUES ('0004', 'calendar_schema', 'manual')
ON CONFLICT (version) DO NOTHING;
