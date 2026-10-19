-- ============================================================
-- FPC HUB v15 · 0001_init.up.sql (Bản làm sạch & chuẩn hóa)
-- ============================================================

-- PART 1: Migration tracking
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  applied_by TEXT,
  checksum TEXT
);

-- PART 2: Enums (Lưu ý: Dùng dấu nháy đơn thẳng hoàn toàn)
CREATE TYPE public.user_role AS ENUM ('super_admin', 'admin', 'member', 'viewer');
CREATE TYPE public.approval_status AS ENUM ('pending', 'active', 'rejected');
CREATE TYPE public.dept_role AS ENUM ('head', 'deputy', 'member');

-- PART 3: profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  nickname TEXT,
  bio TEXT,
  avatar_url TEXT,
  avatar_color TEXT DEFAULT 'violet',
  role public.user_role NOT NULL DEFAULT 'member',
  approval_status public.approval_status NOT NULL DEFAULT 'pending',
  status TEXT DEFAULT 'offline',
  timezone TEXT DEFAULT 'Asia/Ho_Chi_Minh',
  version INTEGER NOT NULL DEFAULT 1,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_profiles_approval ON public.profiles(approval_status);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- PART 4: departments
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT 'violet',
  icon TEXT NOT NULL DEFAULT 'fa-users',
  head_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PART 5: department_members
CREATE TABLE IF NOT EXISTS public.department_members (
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.dept_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (department_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_dept_members_user ON public.department_members(user_id);

-- PART 6: Helper functions
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin' AND approval_status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_club_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('super_admin', 'admin') AND approval_status = 'active'
  );
$$;

-- PART 7: touch_row (auto version + updated_at)
CREATE OR REPLACE FUNCTION public.touch_row()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_touch ON public.profiles;
CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_row();

DROP TRIGGER IF EXISTS trg_departments_touch ON public.departments;
CREATE TRIGGER trg_departments_touch BEFORE UPDATE ON public.departments
FOR EACH ROW EXECUTE FUNCTION public.touch_row();

-- PART 8: prevent_role_self_change
CREATE OR REPLACE FUNCTION public.prevent_role_self_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE actor_role public.user_role;
BEGIN
  IF NEW.id != auth.uid() THEN RETURN NEW; END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    SELECT role INTO actor_role FROM public.profiles WHERE id = auth.uid();
    IF actor_role != 'super_admin' THEN
      RAISE EXCEPTION 'Không được tự đổi role';
    END IF;
  END IF;

  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    RAISE EXCEPTION 'Không được tự đổi approval_status';
  END IF;

  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by THEN
    RAISE EXCEPTION 'Không được tự đổi approved_by';
  END IF;

  IF NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
    RAISE EXCEPTION 'Không được tự đổi approved_at';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_self_change ON public.profiles;
CREATE TRIGGER trg_prevent_role_self_change BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_role_self_change();

-- PART 9: handle_new_user (từ auth.users)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE is_admin_email BOOLEAN := NEW.email IN (
  'tarotkarot.vn@gmail.com',
  'clbnangsuatchatluongdhln@gmail.com'
);
BEGIN
  INSERT INTO public.profiles (
    id, email, display_name, avatar_color, role, status, approval_status
  ) VALUES (
    NEW.id,
    COALESCE(NEW.email, 'user_' || substr(NEW.id::text, 1, 8) || '@local'),
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      NEW.raw_user_meta_data->>'name',
      split_part(COALESCE(NEW.email, 'user'), '@', 1)
    ),
    'violet',
    CASE WHEN is_admin_email THEN 'super_admin'::public.user_role ELSE 'member'::public.user_role END,
    'offline',
    CASE WHEN is_admin_email THEN 'active'::public.approval_status ELSE 'pending'::public.approval_status END
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- PART 10: Recover profiles cho auth.users cũ (nếu có)
INSERT INTO public.profiles (id, email, display_name, role, approval_status, status)
SELECT 
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'display_name', split_part(au.email, '@', 1)),
  CASE WHEN au.email IN ('tarotkarot.vn@gmail.com', 'clbnangsuatchatluongdhln@gmail.com')
    THEN 'super_admin'::public.user_role ELSE 'member'::public.user_role END,
  'active'::public.approval_status,
  'offline'
FROM auth.users au
WHERE au.email IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = au.id);

-- PART 11: Bật RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

-- PART 12: RLS profiles
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_club_admin());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_club_admin() AND id != auth.uid())
  WITH CHECK (public.is_club_admin() AND id != auth.uid());

DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;
CREATE POLICY "profiles_delete_admin" ON public.profiles
  FOR DELETE TO authenticated
  USING (public.is_super_admin() AND id != auth.uid());

-- PART 13: VIEW profiles_public (không email) cho mọi authenticated
CREATE OR REPLACE VIEW public.profiles_public AS
SELECT id, display_name, nickname, bio, avatar_url, avatar_color, role, status, created_at
FROM public.profiles
WHERE approval_status = 'active';

GRANT SELECT ON public.profiles_public TO authenticated;

-- PART 14: RLS departments
DROP POLICY IF EXISTS "departments_select" ON public.departments;
CREATE POLICY "departments_select" ON public.departments
  FOR SELECT TO authenticated USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "departments_insert" ON public.departments;
CREATE POLICY "departments_insert" ON public.departments
  FOR INSERT TO authenticated WITH CHECK (public.is_club_admin());

DROP POLICY IF EXISTS "departments_update" ON public.departments;
CREATE POLICY "departments_update" ON public.departments
  FOR UPDATE TO authenticated USING (public.is_club_admin()) WITH CHECK (public.is_club_admin());

DROP POLICY IF EXISTS "departments_delete" ON public.departments;
CREATE POLICY "departments_delete" ON public.departments
  FOR DELETE TO authenticated USING (public.is_super_admin());

-- PART 15: RLS department_members
DROP POLICY IF EXISTS "dept_members_select" ON public.department_members;
CREATE POLICY "dept_members_select" ON public.department_members
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "dept_members_insert" ON public.department_members;
CREATE POLICY "dept_members_insert" ON public.department_members
  FOR INSERT TO authenticated WITH CHECK (public.is_club_admin());

DROP POLICY IF EXISTS "dept_members_update" ON public.department_members;
CREATE POLICY "dept_members_update" ON public.department_members
  FOR UPDATE TO authenticated USING (public.is_club_admin());

DROP POLICY IF EXISTS "dept_members_delete" ON public.department_members;
CREATE POLICY "dept_members_delete" ON public.department_members
  FOR DELETE TO authenticated USING (public.is_club_admin());

-- PART 16: RLS schema_migrations
DROP POLICY IF EXISTS "schema_migrations_admin_only" ON public.schema_migrations;
CREATE POLICY "schema_migrations_admin_only" ON public.schema_migrations
  FOR SELECT TO authenticated USING (public.is_super_admin());

-- PART 17: Ghi nhận
INSERT INTO public.schema_migrations (version, name, applied_by)
VALUES ('0001', 'init_profiles_departments', 'manual')
ON CONFLICT (version) DO NOTHING;
