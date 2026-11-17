DO $guard$
DECLARE target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['projects','project_phases','tasks','subtasks','submissions','task_submissions','task_history','files'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS collaboration_active_read_guard ON public.%I', target_table);
    EXECUTE format('CREATE POLICY collaboration_active_read_guard ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING ((SELECT EXISTS (SELECT 1 FROM public.profiles AS member_profile WHERE member_profile.id = (SELECT auth.uid()) AND member_profile.approval_status = ''active'')))', target_table);
  END LOOP;
END;
$guard$;
