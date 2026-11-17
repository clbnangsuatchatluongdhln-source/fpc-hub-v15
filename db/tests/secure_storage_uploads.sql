BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"service_role"}',true);
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
CREATE TEMP TABLE storage_test_ids(label text PRIMARY KEY,id uuid NOT NULL DEFAULT gen_random_uuid());
INSERT INTO storage_test_ids(label) VALUES('owner'),('other'),('pending'),('admin'),('event'),('null_event'),('project'),('ticket'),('expired'),('revoked'),('b2_ticket');
GRANT SELECT ON storage_test_ids TO authenticated,service_role;
INSERT INTO auth.users(id,email,raw_user_meta_data)
SELECT id,'storage-test-'||id::text||'@example.invalid','{"display_name":"Storage test"}'::jsonb FROM storage_test_ids WHERE label IN('owner','other','pending','admin');
UPDATE public.profiles SET approval_status='active' WHERE id IN(SELECT id FROM storage_test_ids WHERE label IN('owner','other','admin'));
UPDATE public.profiles SET role='admin' WHERE id=(SELECT id FROM storage_test_ids WHERE label='admin');
INSERT INTO public.events(id,title,start_time,end_time,visibility,created_by)
SELECT id,'Storage private test',now(),now()+interval '1 hour','private',(SELECT id FROM storage_test_ids WHERE label='owner') FROM storage_test_ids WHERE label='event';
INSERT INTO public.events(id,title,start_time,end_time,visibility,created_by)
SELECT id,'Storage null owner',now(),now()+interval '1 hour','private',NULL FROM storage_test_ids WHERE label='null_event';
INSERT INTO public.projects(id,name,owner_id)
SELECT id,'Storage project test',(SELECT id FROM storage_test_ids WHERE label='owner') FROM storage_test_ids WHERE label='project';
INSERT INTO public.storage_connections(label,provider,env_prefix,bucket,document_priority,capacity_bytes,endpoint_url) VALUES ('Test Tigris','tigris','STORAGE_CONN_SQL_TEST_T','test',1,1000000,'https://test.invalid'),('Test B2','b2','STORAGE_CONN_SQL_TEST_B','test',1,1000000,'https://test.invalid');
CREATE TEMP TABLE storage_results(label text,passed boolean);
GRANT ALL ON storage_results TO authenticated,service_role;
CREATE FUNCTION pg_temp.assert_storage(label text,passed boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF passed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Storage assertion failed: %',label; END IF; INSERT INTO storage_results VALUES(label,true); END;$$;
CREATE FUNCTION pg_temp.deny_storage(label text,command text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE denied boolean:=false;
BEGIN BEGIN EXECUTE command; EXCEPTION WHEN insufficient_privilege OR invalid_parameter_value THEN denied:=true; END;
PERFORM pg_temp.assert_storage(label,denied); END;$$;
SELECT pg_temp.assert_storage('owner writes own event',fpc_private.storage_parent_access((SELECT id FROM storage_test_ids WHERE label='owner'),(SELECT id FROM storage_test_ids WHERE label='event'),NULL,true));
SELECT pg_temp.assert_storage('other cannot write event',NOT fpc_private.storage_parent_access((SELECT id FROM storage_test_ids WHERE label='other'),(SELECT id FROM storage_test_ids WHERE label='event'),NULL,true));
SELECT pg_temp.assert_storage('null owner private event fails closed',NOT fpc_private.storage_parent_access((SELECT id FROM storage_test_ids WHERE label='other'),(SELECT id FROM storage_test_ids WHERE label='null_event'),NULL,true));
SELECT pg_temp.assert_storage('other cannot read private event',NOT fpc_private.storage_parent_access((SELECT id FROM storage_test_ids WHERE label='other'),(SELECT id FROM storage_test_ids WHERE label='event'),NULL,false));
SELECT pg_temp.assert_storage('pending cannot use hub',NOT fpc_private.storage_parent_access((SELECT id FROM storage_test_ids WHERE label='pending'),NULL,NULL,true));
SELECT pg_temp.assert_storage('owner writes own project',fpc_private.storage_parent_access((SELECT id FROM storage_test_ids WHERE label='owner'),NULL,(SELECT id FROM storage_test_ids WHERE label='project'),true));
SELECT pg_temp.assert_storage('other cannot write project',NOT fpc_private.storage_parent_access((SELECT id FROM storage_test_ids WHERE label='other'),NULL,(SELECT id FROM storage_test_ids WHERE label='project'),true));
SELECT pg_temp.assert_storage('missing parent denied',NOT fpc_private.storage_parent_access((SELECT id FROM storage_test_ids WHERE label='owner'),gen_random_uuid(),NULL,true));
SELECT pg_temp.assert_storage('admin retains parent access',fpc_private.storage_parent_access((SELECT id FROM storage_test_ids WHERE label='admin'),(SELECT id FROM storage_test_ids WHERE label='event'),NULL,true));
SELECT public.storage_issue_upload(jsonb_build_object('id',(SELECT id FROM storage_test_ids WHERE label='ticket'),'owner_id',(SELECT id FROM storage_test_ids WHERE label='owner'),'provider','tigris','bucket','test','storage_path',(SELECT storage_path FROM public.storage_uploads WHERE id=(SELECT id FROM storage_test_ids WHERE label='ticket')),'name','test.txt','mime_type','text/plain','kind','document','size',3,'event_id',(SELECT id FROM storage_test_ids WHERE label='event')));
SELECT pg_temp.deny_storage('wrong owner cannot finalize',$q$ SELECT public.storage_finalize_upload((SELECT id FROM storage_test_ids WHERE label='ticket'),(SELECT id FROM storage_test_ids WHERE label='other'),'wrong') $q$);
SELECT pg_temp.deny_storage('wrong object cannot finalize',$q$ SELECT public.storage_finalize_upload((SELECT id FROM storage_test_ids WHERE label='ticket'),(SELECT id FROM storage_test_ids WHERE label='owner'),'wrong') $q$);
SELECT public.storage_finalize_upload((SELECT id FROM storage_test_ids WHERE label='ticket'),(SELECT id FROM storage_test_ids WHERE label='owner'),(SELECT storage_path FROM public.storage_uploads WHERE id=(SELECT id FROM storage_test_ids WHERE label='ticket')));
SELECT public.storage_finalize_upload((SELECT id FROM storage_test_ids WHERE label='ticket'),(SELECT id FROM storage_test_ids WHERE label='owner'),(SELECT storage_path FROM public.storage_uploads WHERE id=(SELECT id FROM storage_test_ids WHERE label='ticket')));
SELECT pg_temp.assert_storage('replay creates exactly one metadata row',(SELECT count(*)=1 FROM public.files WHERE id=(SELECT id FROM storage_test_ids WHERE label='ticket')));
SELECT pg_temp.assert_storage('metadata derives owner parent provider',(SELECT uploaded_by=(SELECT id FROM storage_test_ids WHERE label='owner') AND event_id=(SELECT id FROM storage_test_ids WHERE label='event') AND storage_provider='tigris' AND size=3 FROM public.files WHERE id=(SELECT id FROM storage_test_ids WHERE label='ticket')));
SELECT public.storage_issue_upload(jsonb_build_object('id',(SELECT id FROM storage_test_ids WHERE label='b2_ticket'),'owner_id',(SELECT id FROM storage_test_ids WHERE label='owner'),'provider','b2','bucket','test','storage_path',(SELECT storage_path FROM public.storage_uploads WHERE id=(SELECT id FROM storage_test_ids WHERE label='b2_ticket')),'name','b2.txt','mime_type','text/plain','kind','document','size',3));
SELECT pg_temp.deny_storage('B2 cannot finalize without a verified version',$q$ SELECT public.storage_finalize_upload((SELECT id FROM storage_test_ids WHERE label='b2_ticket'),(SELECT id FROM storage_test_ids WHERE label='owner'),(SELECT storage_path FROM public.storage_uploads WHERE id=(SELECT id FROM storage_test_ids WHERE label='b2_ticket'))) $q$);
SELECT pg_temp.deny_storage('B2 rejects malformed version identity',$q$ SELECT public.storage_finalize_upload((SELECT id FROM storage_test_ids WHERE label='b2_ticket'),(SELECT id FROM storage_test_ids WHERE label='owner'),(SELECT storage_path FROM public.storage_uploads WHERE id=(SELECT id FROM storage_test_ids WHERE label='b2_ticket')),'bad?version') $q$);
SELECT public.storage_finalize_upload((SELECT id FROM storage_test_ids WHERE label='b2_ticket'),(SELECT id FROM storage_test_ids WHERE label='owner'),(SELECT storage_path FROM public.storage_uploads WHERE id=(SELECT id FROM storage_test_ids WHERE label='b2_ticket')),'test_version_1234567890');
SELECT pg_temp.assert_storage('B2 pins version in file and session',(SELECT storage_version='test_version_1234567890' FROM public.files WHERE id=(SELECT id FROM storage_test_ids WHERE label='b2_ticket')) AND (SELECT storage_version='test_version_1234567890' FROM public.storage_uploads WHERE id=(SELECT id FROM storage_test_ids WHERE label='b2_ticket')));
SELECT public.storage_finalize_upload((SELECT id FROM storage_test_ids WHERE label='b2_ticket'),(SELECT id FROM storage_test_ids WHERE label='owner'),(SELECT storage_path FROM public.storage_uploads WHERE id=(SELECT id FROM storage_test_ids WHERE label='b2_ticket')),'replayed_version_1234567890');
SELECT pg_temp.assert_storage('B2 replay cannot change accepted version',(SELECT storage_version='test_version_1234567890' FROM public.files WHERE id=(SELECT id FROM storage_test_ids WHERE label='b2_ticket')));
INSERT INTO public.storage_uploads(id,owner_id,provider,bucket,storage_path,name,mime_type,kind,size,expires_at)
SELECT id,(SELECT id FROM storage_test_ids WHERE label='owner'),'tigris','test','storage-test/'||id::text,'expired.txt','text/plain','document',3,now()-interval '1 second' FROM storage_test_ids WHERE label='expired';
SELECT pg_temp.deny_storage('expired ticket cannot finalize',$q$ SELECT public.storage_finalize_upload((SELECT id FROM storage_test_ids WHERE label='expired'),(SELECT id FROM storage_test_ids WHERE label='owner'),(SELECT storage_path FROM public.storage_uploads WHERE id=(SELECT id FROM storage_test_ids WHERE label='expired'))) $q$);
UPDATE public.profiles SET approval_status='rejected' WHERE id=(SELECT id FROM storage_test_ids WHERE label='owner');
SELECT pg_temp.deny_storage('revoked approval cannot finalize replay',$q$ SELECT public.storage_finalize_upload((SELECT id FROM storage_test_ids WHERE label='ticket'),(SELECT id FROM storage_test_ids WHERE label='owner'),(SELECT storage_path FROM public.storage_uploads WHERE id=(SELECT id FROM storage_test_ids WHERE label='ticket'))) $q$);
UPDATE public.profiles SET approval_status='active' WHERE id=(SELECT id FROM storage_test_ids WHERE label='owner');
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM storage_test_ids WHERE label='owner'),'role','authenticated')::text,true);
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM storage_test_ids WHERE label='owner'),true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.deny_storage('direct owner metadata insert denied',$q$ INSERT INTO public.files(name,storage_path,uploaded_by) VALUES('forged','forged/'||gen_random_uuid()::text,auth.uid()) $q$);
SELECT pg_temp.deny_storage('direct null owner insert denied',$q$ INSERT INTO public.files(name,storage_path,uploaded_by) VALUES('forged','forged/'||gen_random_uuid()::text,NULL) $q$);
SELECT pg_temp.deny_storage('direct metadata update denied',$q$ UPDATE public.files SET storage_path='forged' WHERE id=(SELECT id FROM storage_test_ids WHERE label='ticket') $q$);
SELECT pg_temp.deny_storage('client cannot issue trusted upload',$q$ SELECT public.storage_issue_upload('{}'::jsonb) $q$);
SELECT pg_temp.deny_storage('client cannot finalize trusted upload',$q$ SELECT public.storage_finalize_upload(gen_random_uuid(),auth.uid(),'forged') $q$);
SELECT pg_temp.deny_storage('client cannot insert ticket',$q$ INSERT INTO public.storage_uploads(id) VALUES(gen_random_uuid()) $q$);
SELECT pg_temp.assert_storage('owner reads authorized metadata',(SELECT count(*)=1 FROM public.files WHERE id=(SELECT id FROM storage_test_ids WHERE label='ticket')));
RESET ROLE;
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT id FROM storage_test_ids WHERE label='other'),'role','authenticated')::text,true);
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM storage_test_ids WHERE label='other'),true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_storage('other cannot read private attachment metadata',(SELECT count(*)=0 FROM public.files WHERE id=(SELECT id FROM storage_test_ids WHERE label='ticket')));
RESET ROLE;
SELECT count(*) AS checks_passed,bool_and(passed) AS all_passed FROM storage_results;
ROLLBACK;
