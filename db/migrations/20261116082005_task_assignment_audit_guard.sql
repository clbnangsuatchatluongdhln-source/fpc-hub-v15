CREATE SCHEMA IF NOT EXISTS fpc_private;
GRANT USAGE ON SCHEMA fpc_private TO authenticated;

CREATE OR REPLACE FUNCTION fpc_private.can_manage_work(dept uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.approval_status='active'
    AND (p.role IN ('super_admin','admin') OR EXISTS (
      SELECT 1 FROM public.departments d WHERE d.id=dept AND d.head_id=p.id AND d.deleted_at IS NULL
    ))
  );
$$;
REVOKE ALL ON FUNCTION fpc_private.can_manage_work(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION fpc_private.can_manage_work(uuid) TO authenticated;

DROP POLICY IF EXISTS task_create_authority_guard ON public.tasks;
CREATE POLICY task_create_authority_guard ON public.tasks AS RESTRICTIVE
FOR INSERT TO authenticated WITH CHECK (
  fpc_private.can_manage_work(department_id) AND created_by=(SELECT auth.uid())
  AND status='assigned'
  AND (project_id IS NULL OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id=project_id AND (p.department_id IS NULL OR p.department_id=tasks.department_id)))
);
DROP POLICY IF EXISTS task_change_authority_guard ON public.tasks;
CREATE POLICY task_change_authority_guard ON public.tasks AS RESTRICTIVE
FOR UPDATE TO authenticated USING (fpc_private.can_manage_work(department_id))
WITH CHECK (fpc_private.can_manage_work(department_id));

DROP POLICY IF EXISTS subtask_create_authority_guard ON public.subtasks;
CREATE POLICY subtask_create_authority_guard ON public.subtasks AS RESTRICTIVE
FOR INSERT TO authenticated WITH CHECK (
  created_by=(SELECT auth.uid()) AND status='todo'
  AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id=task_id AND fpc_private.can_manage_work(t.department_id))
);

CREATE OR REPLACE FUNCTION fpc_private.guard_work_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE manager boolean;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND approval_status='active') THEN
    RAISE EXCEPTION 'Active membership required' USING ERRCODE='42501';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Creator must match session' USING ERRCODE='42501'; END IF;
    NEW.created_at:=statement_timestamp();
    IF TG_TABLE_NAME='subtasks' AND to_jsonb(NEW)->>'submitted_at' IS NOT NULL THEN
      RAISE EXCEPTION 'Subtask must start unsubmitted' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Work identity is immutable' USING ERRCODE='42501';
  END IF;
  IF TG_TABLE_NAME='tasks' THEN
    IF (NEW.status IN ('approved','rejected') AND NEW.status IS DISTINCT FROM OLD.status) AND NOT public.is_club_admin() THEN
      RAISE EXCEPTION 'Club reviewer required' USING ERRCODE='42501';
    END IF;
    IF NEW.project_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.projects p WHERE p.id=NEW.project_id AND (p.department_id IS NULL OR p.department_id=NEW.department_id)
    ) THEN RAISE EXCEPTION 'Project department mismatch' USING ERRCODE='42501'; END IF;
  ELSE
    IF NEW.task_id IS DISTINCT FROM OLD.task_id THEN RAISE EXCEPTION 'Subtask parent is immutable' USING ERRCODE='42501'; END IF;
    SELECT fpc_private.can_manage_work(t.department_id) INTO manager FROM public.tasks t WHERE t.id=OLD.task_id;
    IF NOT coalesce(manager,false) AND (
      OLD.assignee_id IS DISTINCT FROM auth.uid() OR NEW.status NOT IN ('doing','submitted')
      OR (to_jsonb(NEW)-ARRAY['status','submitted_at','updated_at','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','submitted_at','updated_at','version'])
    ) THEN RAISE EXCEPTION 'Subtask manager required' USING ERRCODE='42501'; END IF;
    IF NEW.status='submitted' AND NEW.status IS DISTINCT FROM OLD.status THEN
      NEW:=jsonb_populate_record(NEW,jsonb_build_object('submitted_at',statement_timestamp()));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION fpc_private.guard_work_identity() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_work_identity ON public.tasks;
CREATE TRIGGER trg_work_identity BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION fpc_private.guard_work_identity();
DROP TRIGGER IF EXISTS trg_work_identity ON public.subtasks;
CREATE TRIGGER trg_work_identity BEFORE INSERT OR UPDATE ON public.subtasks FOR EACH ROW EXECUTE FUNCTION fpc_private.guard_work_identity();

CREATE OR REPLACE FUNCTION fpc_private.touch_work_row()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW:=jsonb_populate_record(NEW,jsonb_build_object('updated_at',statement_timestamp()));
  IF to_jsonb(OLD) ? 'version' THEN NEW:=jsonb_populate_record(NEW,jsonb_build_object('version',coalesce((to_jsonb(OLD)->>'version')::integer,0)+1)); END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION fpc_private.touch_work_row() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_tasks_touch ON public.tasks;
CREATE TRIGGER trg_tasks_touch BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION fpc_private.touch_work_row();
DROP TRIGGER IF EXISTS trg_subtasks_touch ON public.subtasks;
CREATE TRIGGER trg_subtasks_touch BEFORE UPDATE ON public.subtasks FOR EACH ROW EXECUTE FUNCTION fpc_private.touch_work_row();

REVOKE INSERT,UPDATE,DELETE ON public.task_history FROM authenticated,anon;
DROP POLICY IF EXISTS task_history_insert ON public.task_history;

CREATE OR REPLACE FUNCTION fpc_private.record_work_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE task_key uuid; event_action text; event_note text; before_status text; after_status text;
BEGIN
  IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['updated_at','version']) IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','version']) THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='tasks' THEN
    task_key:=NEW.id;
    IF TG_OP='INSERT' THEN event_action:='create_task'; event_note:='Task được tạo';
    ELSE
      before_status:=OLD.status; after_status:=NEW.status;
      event_action:=CASE WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'task_status_changed' ELSE 'update_task' END;
      event_note:='Task được cập nhật';
    END IF;
  ELSIF TG_TABLE_NAME='subtasks' THEN
    task_key:=NEW.task_id;
    event_action:=CASE WHEN TG_OP='INSERT' THEN 'create_subtask' ELSE 'update_subtask' END;
    event_note:='Subtask được '||CASE WHEN TG_OP='INSERT' THEN 'tạo' ELSE 'cập nhật' END;
    IF TG_OP='UPDATE' THEN before_status:=OLD.status; END IF;
    after_status:=NEW.status;
  ELSIF TG_TABLE_NAME='submissions' THEN
    SELECT task_id INTO task_key FROM public.subtasks WHERE id=NEW.subtask_id;
    event_action:=CASE WHEN TG_OP='INSERT' THEN 'submit_subtask_file' ELSE 'submission_updated' END;
    event_note:='Bài nộp được '||CASE WHEN TG_OP='INSERT' THEN 'tạo' ELSE 'cập nhật' END;
  ELSE
    task_key:=NEW.task_id;
    event_action:=CASE WHEN TG_OP='INSERT' THEN 'task_submission_created' ELSE 'task_submission_updated' END;
    event_note:='Bản nộp nghiệm thu được '||CASE WHEN TG_OP='INSERT' THEN 'tạo' ELSE 'cập nhật' END;
    IF TG_OP='UPDATE' THEN before_status:=OLD.status; END IF;
    after_status:=NEW.status;
  END IF;
  INSERT INTO public.task_history(task_id,action,actor_id,old_status,new_status,note,metadata,created_at)
  VALUES(task_key,event_action,(SELECT id FROM public.profiles WHERE id=auth.uid()),before_status,after_status,event_note,
    jsonb_build_object('source','database_trigger','table',TG_TABLE_NAME,'record_id',NEW.id,'operation',TG_OP),statement_timestamp());
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION fpc_private.record_work_history() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_work_history ON public.tasks;
CREATE TRIGGER trg_work_history AFTER INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION fpc_private.record_work_history();
DROP TRIGGER IF EXISTS trg_work_history ON public.subtasks;
CREATE TRIGGER trg_work_history AFTER INSERT OR UPDATE ON public.subtasks FOR EACH ROW EXECUTE FUNCTION fpc_private.record_work_history();
DROP TRIGGER IF EXISTS trg_work_history ON public.submissions;
CREATE TRIGGER trg_work_history AFTER INSERT OR UPDATE ON public.submissions FOR EACH ROW EXECUTE FUNCTION fpc_private.record_work_history();
DROP TRIGGER IF EXISTS trg_work_history ON public.task_submissions;
CREATE TRIGGER trg_work_history AFTER INSERT OR UPDATE ON public.task_submissions FOR EACH ROW EXECUTE FUNCTION fpc_private.record_work_history();
