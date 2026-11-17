BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"service_role"}',true);
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
CREATE TEMP TABLE approval_read_fixtures(label text PRIMARY KEY, id uuid NOT NULL DEFAULT gen_random_uuid());
INSERT INTO approval_read_fixtures(label) VALUES ('active'),('pending'),('rejected'),('missing'),('project'),('phase'),('task'),('subtask'),('submission'),('task_submission'),('history'),('file');
GRANT SELECT ON approval_read_fixtures TO authenticated;
INSERT INTO auth.users(id,email,raw_user_meta_data)
SELECT id,'approval-read-'||id::text||'@example.invalid','{"display_name":"Approval read fixture"}'::jsonb
FROM approval_read_fixtures WHERE label IN ('active','pending','rejected');
UPDATE public.profiles SET approval_status='active' WHERE id=(SELECT id FROM approval_read_fixtures WHERE label='active');
UPDATE public.profiles SET approval_status='rejected' WHERE id=(SELECT id FROM approval_read_fixtures WHERE label='rejected');
INSERT INTO public.projects(id,name) SELECT id,'Approval read fixture' FROM approval_read_fixtures WHERE label='project';
INSERT INTO public.project_phases(id,project_id,name) SELECT id,(SELECT id FROM approval_read_fixtures WHERE label='project'),'Approval read phase' FROM approval_read_fixtures WHERE label='phase';
INSERT INTO public.tasks(id,title,project_id) SELECT id,'Approval read task',(SELECT id FROM approval_read_fixtures WHERE label='project') FROM approval_read_fixtures WHERE label='task';
INSERT INTO public.subtasks(id,task_id,title) SELECT id,(SELECT id FROM approval_read_fixtures WHERE label='task'),'Approval read subtask' FROM approval_read_fixtures WHERE label='subtask';
INSERT INTO public.submissions(id,subtask_id,member_id) SELECT id,(SELECT id FROM approval_read_fixtures WHERE label='subtask'),(SELECT id FROM approval_read_fixtures WHERE label='active') FROM approval_read_fixtures WHERE label='submission';
INSERT INTO public.task_submissions(id,task_id,head_id) SELECT id,(SELECT id FROM approval_read_fixtures WHERE label='task'),(SELECT id FROM approval_read_fixtures WHERE label='active') FROM approval_read_fixtures WHERE label='task_submission';
INSERT INTO public.task_history(id,task_id,action) SELECT id,(SELECT id FROM approval_read_fixtures WHERE label='task'),'approval_read_test' FROM approval_read_fixtures WHERE label='history';
INSERT INTO public.files(id,name,storage_path,uploaded_by) SELECT id,'Approval read file','approval-read-test/'||id::text,(SELECT id FROM approval_read_fixtures WHERE label='active') FROM approval_read_fixtures WHERE label='file';
CREATE FUNCTION pg_temp.check_collaboration_reads(expected bigint) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE table_name text; fixture_label text; actual bigint; checks integer:=0;
BEGIN
  FOR table_name,fixture_label IN SELECT * FROM (VALUES ('projects','project'),('project_phases','phase'),('tasks','task'),('subtasks','subtask'),('submissions','submission'),('task_submissions','task_submission'),('task_history','history'),('files','file')) AS fixtures(t,l) LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE id=(SELECT id FROM approval_read_fixtures WHERE label=$1)',table_name) INTO actual USING fixture_label;
    IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Read guard failed on %, expected %, got %',table_name,expected,actual; END IF;
    checks:=checks+1;
  END LOOP;
  RETURN checks;
END;
$$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM approval_read_fixtures WHERE label='active'),'role','authenticated')::text,true);
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM approval_read_fixtures WHERE label='active'),true);
SELECT 'active' AS scenario, pg_temp.check_collaboration_reads(1) AS checks_passed;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM approval_read_fixtures WHERE label='pending'),'role','authenticated')::text,true);
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM approval_read_fixtures WHERE label='pending'),true);
SELECT 'pending' AS scenario, pg_temp.check_collaboration_reads(0) AS checks_passed;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM approval_read_fixtures WHERE label='rejected'),'role','authenticated')::text,true);
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM approval_read_fixtures WHERE label='rejected'),true);
SELECT 'rejected' AS scenario, pg_temp.check_collaboration_reads(0) AS checks_passed;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM approval_read_fixtures WHERE label='missing'),'role','authenticated')::text,true);
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM approval_read_fixtures WHERE label='missing'),true);
SELECT 'missing_profile' AS scenario, pg_temp.check_collaboration_reads(0) AS checks_passed;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"service_role"}',true);
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
UPDATE public.profiles SET approval_status='rejected' WHERE id=(SELECT id FROM approval_read_fixtures WHERE label='active');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM approval_read_fixtures WHERE label='active'),'role','authenticated')::text,true);
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM approval_read_fixtures WHERE label='active'),true);
SELECT 'revoked_approval_same_identity' AS scenario, pg_temp.check_collaboration_reads(0) AS checks_passed;
ROLLBACK;
