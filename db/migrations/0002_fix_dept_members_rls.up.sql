-- ============================================================
-- FPC HUB v15 · 0002_fix_dept_members_rls.up.sql
--
-- Fix P0: Đóng lỗ hổng RLS trên department_members.
--
-- Trước: dept_members_select USING (true)
--        → MỌI authenticated user đọc được toàn bộ bảng.
--
-- Sau:   - user là thành viên của chính department đó, HOẶC
--        - user là club_admin / super_admin (đã active).
--
-- Kỹ thuật:
--   Không thể subquery trực tiếp `SELECT 1 FROM department_members...`
--   trong policy của chính bảng đó → PostgreSQL báo "infinite recursion
--   detected in policy". Do đó helper `is_department_member` bắt buộc
--   SECURITY DEFINER để bypass RLS trên bảng đích.
--
-- Idempotent: DROP POLICY IF EXISTS + ON CONFLICT DO NOTHING.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. Helper: user hiện tại có là thành viên của dept X?
--    SECURITY DEFINER + search_path khoá = chống search_path hijack.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_department_member(dept_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.department_members
    WHERE department_id = dept_id
      AND user_id = auth.uid()
  );
$$;

-- Least privilege: không cho PUBLIC execute, chỉ authenticated.
REVOKE ALL ON FUNCTION public.is_department_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_department_member(UUID) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 2. Gỡ policy cũ + tạo policy mới.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "dept_members_select" ON public.department_members;

CREATE POLICY "dept_members_select" ON public.department_members
  FOR SELECT TO authenticated
  USING (
    public.is_club_admin()
    OR public.is_department_member(department_id)
  );

-- ────────────────────────────────────────────────────────────
-- 3. Ghi nhận migration (idempotent).
--    checksum để trống — migration runner nên tính và điền.
-- ────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version, name, applied_by)
VALUES ('0002', 'fix_dept_members_rls', 'manual')
ON CONFLICT (version) DO NOTHING;

COMMIT;
