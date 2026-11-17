CREATE OR REPLACE FUNCTION fpc_private.can_manage_work(dept uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.approval_status='active'
    AND (public.is_club_admin() OR EXISTS (
      SELECT 1 FROM public.departments d WHERE d.id=dept AND d.head_id=p.id AND d.deleted_at IS NULL
    ))
  );
$$;
REVOKE ALL ON FUNCTION fpc_private.can_manage_work(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION fpc_private.can_manage_work(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION fpc_private.can_manage_submission(subtask uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.subtasks s JOIN public.tasks t ON t.id=s.task_id WHERE s.id=subtask AND fpc_private.can_manage_work(t.department_id)); $$;
REVOKE ALL ON FUNCTION fpc_private.can_manage_submission(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION fpc_private.can_manage_submission(uuid) TO authenticated;

ALTER TABLE public.subtasks ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS reject_count integer NOT NULL DEFAULT 0;

DROP POLICY IF EXISTS submission_create_authority_guard ON public.submissions;
CREATE POLICY submission_create_authority_guard ON public.submissions AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (
  member_id=(SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.approval_status='active')
  AND EXISTS (SELECT 1 FROM public.subtasks s WHERE s.id=subtask_id AND s.assignee_id=(SELECT auth.uid()))
  AND score IS NULL AND contribution_pct IS NULL AND head_note IS NULL AND scored_by IS NULL AND scored_at IS NULL AND is_rejected IS FALSE
);
DROP POLICY IF EXISTS submission_review_parent ON public.submissions;
CREATE POLICY submission_review_parent ON public.submissions FOR UPDATE TO authenticated USING (fpc_private.can_manage_submission(subtask_id)) WITH CHECK (fpc_private.can_manage_submission(subtask_id));
DROP POLICY IF EXISTS submission_review_authority_guard ON public.submissions;
CREATE POLICY submission_review_authority_guard ON public.submissions AS RESTRICTIVE FOR UPDATE TO authenticated USING (fpc_private.can_manage_submission(subtask_id)) WITH CHECK (fpc_private.can_manage_submission(subtask_id));

DROP POLICY IF EXISTS task_submission_create_authority_guard ON public.task_submissions;
CREATE POLICY task_submission_create_authority_guard ON public.task_submissions AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (
  head_id=(SELECT auth.uid()) AND status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND president_note IS NULL AND reject_reason IS NULL
  AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id=task_id AND fpc_private.can_manage_work(t.department_id))
);

CREATE OR REPLACE FUNCTION fpc_private.guard_review_record()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND approval_status='active') THEN RAISE EXCEPTION 'Active membership required' USING ERRCODE='42501'; END IF;
  IF TG_OP='INSERT' THEN
    NEW.submitted_at:=statement_timestamp();
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME='submissions' THEN
    IF NOT fpc_private.can_manage_submission(OLD.subtask_id) THEN RAISE EXCEPTION 'Parent reviewer required' USING ERRCODE='42501'; END IF;
    IF (to_jsonb(NEW)-ARRAY['score','contribution_pct','head_note','is_rejected','scored_by','scored_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['score','contribution_pct','head_note','is_rejected','scored_by','scored_at']) THEN RAISE EXCEPTION 'Review cannot change submitted content or ownership' USING ERRCODE='42501'; END IF;
    NEW.scored_by:=auth.uid(); NEW.scored_at:=statement_timestamp();
  ELSE
    IF NOT public.is_club_admin() THEN RAISE EXCEPTION 'Club reviewer required' USING ERRCODE='42501'; END IF;
    IF (to_jsonb(NEW)-ARRAY['status','president_note','reject_reason','reviewed_by','reviewed_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','president_note','reject_reason','reviewed_by','reviewed_at']) THEN RAISE EXCEPTION 'Review cannot change submitted content or ownership' USING ERRCODE='42501'; END IF;
    IF NEW.status NOT IN ('approved','rejected') OR NEW.status IS NULL THEN RAISE EXCEPTION 'Final review status required' USING ERRCODE='42501'; END IF;
    NEW.reviewed_by:=auth.uid(); NEW.reviewed_at:=statement_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION fpc_private.guard_review_record() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_review_record ON public.submissions;
CREATE TRIGGER trg_review_record BEFORE INSERT OR UPDATE ON public.submissions FOR EACH ROW EXECUTE FUNCTION fpc_private.guard_review_record();
DROP TRIGGER IF EXISTS trg_review_record ON public.task_submissions;
CREATE TRIGGER trg_review_record BEFORE INSERT OR UPDATE ON public.task_submissions FOR EACH ROW EXECUTE FUNCTION fpc_private.guard_review_record();
