BEGIN;
CREATE TEMP TABLE club_access_fixtures(key text PRIMARY KEY, id uuid NOT NULL DEFAULT gen_random_uuid());
INSERT INTO club_access_fixtures(key) VALUES ('leader'),('head'),('member'),('outsider'),('dept_a'),('dept_b'),('private_event'),('club_event'),('dept_event');
GRANT SELECT ON club_access_fixtures TO authenticated;

CREATE FUNCTION pg_temp.assert_club_access(actual boolean, message text)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF actual IS DISTINCT FROM true THEN RAISE EXCEPTION '%', message; END IF; END; $$;

INSERT INTO auth.users(id,email,raw_user_meta_data)
SELECT id, 'fpc-rls-test-' || id::text || '@example.invalid', '{"display_name":"FPC RLS test"}'::jsonb
FROM club_access_fixtures WHERE key IN ('leader','head','member','outsider');
UPDATE public.profiles SET approval_status = 'active'
WHERE id IN (SELECT id FROM club_access_fixtures WHERE key IN ('leader','head','member','outsider'));
UPDATE public.profiles SET club_position = 'president'
WHERE id = (SELECT id FROM club_access_fixtures WHERE key = 'leader');
INSERT INTO public.departments(id,name,head_id)
SELECT d.id,'FPC RLS department A',h.id FROM club_access_fixtures d CROSS JOIN club_access_fixtures h WHERE d.key='dept_a' AND h.key='head';
INSERT INTO public.departments(id,name)
SELECT id,'FPC RLS department B' FROM club_access_fixtures WHERE key='dept_b';
INSERT INTO public.department_members(department_id,user_id,role)
SELECT d.id,u.id,'member' FROM club_access_fixtures d CROSS JOIN club_access_fixtures u WHERE d.key='dept_a' AND u.key='member';
INSERT INTO public.events(id,title,start_time,end_time,visibility,department_id,created_by)
SELECT e.id,'FPC RLS event',now(),now()+interval '1 hour',
  CASE e.key WHEN 'private_event' THEN 'private' WHEN 'dept_event' THEN 'department' ELSE 'public' END,
  CASE WHEN e.key='dept_event' THEN (SELECT id FROM club_access_fixtures WHERE key='dept_a') ELSE NULL END,
  (SELECT id FROM club_access_fixtures WHERE key='head')
FROM club_access_fixtures e WHERE e.key IN ('private_event','dept_event','club_event');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM club_access_fixtures WHERE key='member'),'role','authenticated')::text,true);
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM club_access_fixtures WHERE key='member'),true);
SELECT pg_temp.assert_club_access(NOT public.is_club_admin(),'Member cannot manage appointments');
SELECT pg_temp.assert_club_access((SELECT count(*)=1 FROM public.conversations WHERE scope='club'),'Member reads the shared club chat');
SELECT pg_temp.assert_club_access((SELECT count(*)=1 FROM public.conversations WHERE department_id=(SELECT id FROM club_access_fixtures WHERE key='dept_a')),'Member reads their department chat');
SELECT pg_temp.assert_club_access((SELECT count(*)=0 FROM public.conversations WHERE department_id=(SELECT id FROM club_access_fixtures WHERE key='dept_b')),'Member cannot read another department chat');
SELECT pg_temp.assert_club_access(NOT fpc_private.can_send_conversation((SELECT id FROM public.conversations WHERE scope='club')),'Member cannot post club announcements');
SELECT pg_temp.assert_club_access((SELECT count(*)=0 FROM public.events WHERE id=(SELECT id FROM club_access_fixtures WHERE key='private_event')),'Member cannot read someone else private calendar');
SELECT pg_temp.assert_club_access((SELECT count(*)=1 FROM public.events WHERE id=(SELECT id FROM club_access_fixtures WHERE key='dept_event')),'Member reads department calendar');

SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM club_access_fixtures WHERE key='outsider'),'role','authenticated')::text,true);
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM club_access_fixtures WHERE key='outsider'),true);
SELECT pg_temp.assert_club_access((SELECT count(*)=0 FROM public.conversations WHERE department_id=(SELECT id FROM club_access_fixtures WHERE key='dept_a')),'Outsider cannot read department chat');
SELECT pg_temp.assert_club_access((SELECT count(*)=0 FROM public.events WHERE id=(SELECT id FROM club_access_fixtures WHERE key='dept_event')),'Outsider cannot read department calendar');
SELECT pg_temp.assert_club_access((SELECT count(*)=1 FROM public.events WHERE id=(SELECT id FROM club_access_fixtures WHERE key='club_event')),'Outsider still reads club calendar');

SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM club_access_fixtures WHERE key='head'),'role','authenticated')::text,true);
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM club_access_fixtures WHERE key='head'),true);
SELECT pg_temp.assert_club_access(NOT public.is_club_admin(),'Department head is not a club administrator');
SELECT pg_temp.assert_club_access(fpc_private.can_send_conversation((SELECT id FROM public.conversations WHERE department_id=(SELECT id FROM club_access_fixtures WHERE key='dept_a'))),'Department head can post department messages');

SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM club_access_fixtures WHERE key='leader'),'role','authenticated')::text,true);
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM club_access_fixtures WHERE key='leader'),true);
SELECT pg_temp.assert_club_access(public.is_club_admin(),'Club president can manage appointments');
SELECT pg_temp.assert_club_access(fpc_private.can_send_conversation((SELECT id FROM public.conversations WHERE scope='club')),'Club president can post announcements');
SELECT pg_temp.assert_club_access((SELECT count(*)=0 FROM public.conversations WHERE department_id=(SELECT id FROM club_access_fixtures WHERE key='dept_a')),'Club leadership does not bypass private department membership');
ROLLBACK;
