BEGIN;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
CREATE TABLE public.storage_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), label text NOT NULL,
 provider text NOT NULL CHECK(provider IN('tigris','b2','imagekit')),
 env_prefix text NOT NULL UNIQUE CHECK(env_prefix IN('B2','TIGRIS_STORAGE','IMAGEKIT') OR env_prefix~'^STORAGE_CONN_[A-Z0-9_]+$'),
 bucket text NOT NULL, write_enabled boolean NOT NULL DEFAULT true,
 image_priority integer CHECK(image_priority BETWEEN 1 AND 1000),
 document_priority integer CHECK(document_priority BETWEEN 1 AND 1000),
 video_priority integer CHECK(video_priority BETWEEN 1 AND 1000),
 capacity_bytes bigint NOT NULL CHECK(capacity_bytes>0),
 warn_percent integer NOT NULL DEFAULT 80 CHECK(warn_percent BETWEEN 1 AND 98),
 stop_percent integer NOT NULL DEFAULT 90 CHECK(stop_percent BETWEEN 2 AND 99),
 reported_used_bytes bigint NOT NULL DEFAULT 0 CHECK(reported_used_bytes>=0),
 reported_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(warn_percent<stop_percent)
);
INSERT INTO public.storage_connections(label,provider,env_prefix,bucket,image_priority,document_priority,video_priority,capacity_bytes) VALUES
 ('Ảnh CLB','imagekit','IMAGEKIT','imagekit',10,NULL,NULL,2147483648),
 ('Tài liệu CLB','tigris','TIGRIS_STORAGE','fpc-hub',NULL,10,20,4294967296),
 ('Video CLB','b2','B2','FPCBackbalaze',NULL,20,10,8589934592);
ALTER TABLE public.files ADD COLUMN storage_connection_id uuid REFERENCES public.storage_connections(id);
ALTER TABLE public.storage_uploads ADD COLUMN storage_connection_id uuid REFERENCES public.storage_connections(id);
UPDATE public.files f SET storage_connection_id=c.id FROM public.storage_connections c
 WHERE f.storage_provider=c.provider AND (f.storage_bucket=c.bucket OR f.storage_bucket IS NULL);
UPDATE public.storage_uploads u SET storage_connection_id=c.id FROM public.storage_connections c
 WHERE u.provider=c.provider AND u.bucket=c.bucket;
CREATE INDEX files_storage_connection ON public.files(storage_connection_id);
CREATE INDEX uploads_storage_connection ON public.storage_uploads(storage_connection_id);

CREATE TABLE public.storage_user_limits (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT true,
 max_file_bytes bigint NOT NULL DEFAULT 104857600 CHECK(max_file_bytes BETWEEN 1 AND 104857600),
 daily_bytes bigint NOT NULL DEFAULT 209715200 CHECK(daily_bytes>=0),
 daily_count integer NOT NULL DEFAULT 50 CHECK(daily_count>=0),
 total_bytes bigint NOT NULL DEFAULT 524288000 CHECK(total_bytes>=0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.storage_upload_usage (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 size bigint NOT NULL CHECK(size>0),created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.storage_upload_usage SELECT id,owner_id,size,created_at FROM public.storage_uploads;
CREATE INDEX storage_upload_usage_user_date ON public.storage_upload_usage(user_id,created_at);

CREATE OR REPLACE FUNCTION fpc_private.storage_admin(p_user uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_user AND p.approval_status::text='active' AND
 (p.role::text IN('admin','super_admin') OR coalesce(to_jsonb(p)->>'club_position','') IN('president','vice_president')));
$$;
REVOKE ALL ON FUNCTION fpc_private.storage_admin(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION fpc_private.storage_admin(uuid) TO authenticated,service_role;
ALTER TABLE public.storage_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_user_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_upload_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storage_connections,public.storage_user_limits,public.storage_upload_usage FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.storage_connections,public.storage_user_limits,public.storage_upload_usage TO service_role;

CREATE FUNCTION fpc_private.freeze_storage_connection() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF (NEW.provider IS DISTINCT FROM OLD.provider OR NEW.bucket IS DISTINCT FROM OLD.bucket OR NEW.env_prefix IS DISTINCT FROM OLD.env_prefix)
 AND (EXISTS(SELECT 1 FROM public.files WHERE storage_connection_id=OLD.id) OR EXISTS(SELECT 1 FROM public.storage_uploads WHERE storage_connection_id=OLD.id))
 THEN RAISE EXCEPTION 'Cannot repoint a connection with stored files' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END;$$;
REVOKE ALL ON FUNCTION fpc_private.freeze_storage_connection() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER freeze_storage_connection BEFORE UPDATE ON public.storage_connections FOR EACH ROW EXECUTE FUNCTION fpc_private.freeze_storage_connection();

ALTER TABLE public.notifications ADD COLUMN event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;
ALTER TABLE public.notifications ADD COLUMN storage_notice_key text;
CREATE UNIQUE INDEX notifications_storage_dedupe ON public.notifications(user_id,storage_notice_key) WHERE storage_notice_key IS NOT NULL;
CREATE FUNCTION fpc_private.storage_notice(p_user uuid,p_key text,p_title text,p_body text,p_event uuid DEFAULT NULL)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 INSERT INTO public.notifications(user_id,type,title,body,event_id,storage_notice_key)
 SELECT p_user,'system',p_title,p_body,p_event,p_key WHERE EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user AND approval_status::text='active')
 ON CONFLICT(user_id,storage_notice_key) WHERE storage_notice_key IS NOT NULL DO NOTHING;
$$;
REVOKE ALL ON FUNCTION fpc_private.storage_notice(uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated;

CREATE TABLE public.storage_retention_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_event_id uuid NOT NULL UNIQUE,
 event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
 title text NOT NULL, event_snapshot jsonb NOT NULL,
 state text NOT NULL DEFAULT 'review' CHECK(state IN('review','scheduled','retained','deleting','deleted','failed','cancelled')),
 audience text NOT NULL DEFAULT 'related' CHECK(audience IN('related','club')),
 approved_by uuid REFERENCES public.profiles(id),approved_at timestamptz,delete_after timestamptz,
 hold_by uuid REFERENCES public.profiles(id),hold_reason text,revision integer NOT NULL DEFAULT 0,
 last_error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.storage_retention_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storage_retention_jobs FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.storage_retention_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.storage_issue_upload(p_upload jsonb)
RETURNS public.storage_uploads LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u public.storage_uploads;c public.storage_connections;limits public.storage_user_limits;used bigint;reserved bigint;
 day_bytes bigint;day_count bigint;conn_ids uuid[];
BEGIN
 u.id:=(p_upload->>'id')::uuid;u.owner_id:=(p_upload->>'owner_id')::uuid;
 u.name:=p_upload->>'name';u.mime_type:=p_upload->>'mime_type';u.kind:=p_upload->>'kind';u.size:=(p_upload->>'size')::bigint;
 u.event_id:=(p_upload->>'event_id')::uuid;u.project_id:=(p_upload->>'project_id')::uuid;
 IF NOT fpc_private.storage_parent_access(u.owner_id,u.event_id,u.project_id,true) THEN RAISE EXCEPTION 'Parent permission denied' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.storage_retention_jobs WHERE event_id=u.event_id AND state IN('scheduled','deleting','failed')) THEN RAISE EXCEPTION 'Event pending deletion; request retention first' USING ERRCODE='42501'; END IF;
 IF u.size NOT BETWEEN 1 AND 104857600 OR u.kind NOT IN('image','video','document') OR (u.kind='image' AND u.size>10485760) THEN RAISE EXCEPTION 'Invalid upload' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('storage-pool'));
 PERFORM pg_advisory_xact_lock(hashtext('storage-user:'||u.owner_id::text));
 SELECT * INTO limits FROM public.storage_user_limits WHERE user_id=u.owner_id;
 IF limits.user_id IS NULL THEN limits.enabled:=true;limits.max_file_bytes:=104857600;limits.daily_bytes:=209715200;limits.daily_count:=50;limits.total_bytes:=524288000;END IF;
 SELECT coalesce(sum(size),0),count(*) INTO day_bytes,day_count FROM public.storage_upload_usage WHERE user_id=u.owner_id AND created_at>now()-interval '1 day';
 SELECT coalesce(sum(size),0) INTO used FROM public.files WHERE uploaded_by=u.owner_id;
 SELECT coalesce(sum(size),0) INTO reserved FROM public.storage_uploads WHERE owner_id=u.owner_id AND completed_at IS NULL;
 IF NOT limits.enabled OR u.size>limits.max_file_bytes OR day_bytes+u.size>limits.daily_bytes OR day_count>=limits.daily_count OR used+reserved+u.size>limits.total_bytes
 OR (SELECT count(*) FROM public.storage_upload_usage WHERE user_id=u.owner_id AND created_at>now()-interval '10 minutes')>=20 THEN RAISE EXCEPTION 'User upload quota reached' USING ERRCODE='P0001'; END IF;
 IF p_upload ? 'candidate_ids' THEN SELECT array_agg(value::uuid) INTO conn_ids FROM jsonb_array_elements_text(p_upload->'candidate_ids');
 ELSE SELECT array_agg(id) INTO conn_ids FROM public.storage_connections WHERE provider=p_upload->>'provider' AND bucket=p_upload->>'bucket';END IF;
 FOR c IN SELECT * FROM public.storage_connections WHERE id=ANY(conn_ids) AND write_enabled
 AND CASE u.kind WHEN 'image' THEN image_priority WHEN 'document' THEN document_priority ELSE video_priority END IS NOT NULL
 ORDER BY CASE u.kind WHEN 'image' THEN image_priority WHEN 'document' THEN document_priority ELSE video_priority END,id FOR UPDATE LOOP
   SELECT coalesce(sum(size),0) INTO used FROM public.files WHERE storage_connection_id=c.id;
   SELECT coalesce(sum(size),0) INTO reserved FROM public.storage_uploads WHERE storage_connection_id=c.id AND completed_at IS NULL;
   IF greatest(used+reserved,c.reported_used_bytes)+u.size<=floor(c.capacity_bytes::numeric*c.stop_percent/100) THEN
     u.storage_connection_id:=c.id;u.provider:=c.provider;u.bucket:=c.bucket;EXIT;
   END IF;
 END LOOP;
 IF u.storage_connection_id IS NULL THEN RAISE EXCEPTION 'All eligible stores reached stop threshold' USING ERRCODE='P0001';END IF;
 u.storage_path:=CASE WHEN u.provider='imagekit' THEN '/' ELSE '' END||'fpc-hub/'||u.owner_id::text||'/'||u.id::text||'.'||coalesce(nullif(regexp_replace(lower(substring(u.name FROM '\.([^.]+)$')),'[^a-z0-9]','','g'),''),'bin');
 INSERT INTO public.storage_uploads(id,owner_id,provider,bucket,storage_path,name,mime_type,kind,size,event_id,project_id,storage_connection_id)
 VALUES(u.id,u.owner_id,u.provider,u.bucket,u.storage_path,u.name,u.mime_type,u.kind,u.size,u.event_id,u.project_id,u.storage_connection_id) RETURNING * INTO u;
 INSERT INTO public.storage_upload_usage(id,user_id,size) VALUES(u.id,u.owner_id,u.size);
 RETURN u;
END;$$;

CREATE FUNCTION fpc_private.bind_storage_metadata_connection() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u public.storage_uploads;
BEGIN
 SELECT * INTO u FROM public.storage_uploads WHERE id=NEW.id;
 IF u.id IS NOT NULL THEN
  IF u.event_id IS NOT NULL THEN PERFORM 1 FROM public.events WHERE id=u.event_id FOR UPDATE;END IF;
  IF EXISTS(SELECT 1 FROM public.storage_retention_jobs WHERE event_id=u.event_id AND state IN('scheduled','deleting','failed')) THEN RAISE EXCEPTION 'Event pending deletion' USING ERRCODE='42501';END IF;
  NEW.storage_connection_id:=u.storage_connection_id;
 END IF;
 RETURN NEW;
END;$$;
REVOKE ALL ON FUNCTION fpc_private.bind_storage_metadata_connection() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER storage_bind_connection BEFORE INSERT ON public.files FOR EACH ROW EXECUTE FUNCTION fpc_private.bind_storage_metadata_connection();

CREATE FUNCTION public.storage_refresh_governance(p_retention boolean DEFAULT false) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.storage_connections;p record;j public.storage_retention_jobs;used bigint;reserved bigint;level integer;old_count bigint;
BEGIN
 FOR c IN SELECT * FROM public.storage_connections LOOP
  SELECT coalesce(sum(size),0) INTO used FROM public.files WHERE storage_connection_id=c.id;
  SELECT coalesce(sum(size),0) INTO reserved FROM public.storage_uploads WHERE storage_connection_id=c.id AND completed_at IS NULL;
  level:=CASE WHEN greatest(used+reserved,c.reported_used_bytes)>=c.capacity_bytes::numeric*c.stop_percent/100 THEN c.stop_percent WHEN greatest(used+reserved,c.reported_used_bytes)>=c.capacity_bytes::numeric*c.warn_percent/100 THEN c.warn_percent ELSE 0 END;
  IF level>0 THEN FOR p IN SELECT id FROM public.profiles WHERE fpc_private.storage_admin(id) LOOP
   PERFORM fpc_private.storage_notice(p.id,'storage:capacity:'||c.id::text||':'||level||':'||current_date,'Kho gần đầy: '||c.label,'Đã chạm ngưỡng '||level||'%. Hệ thống ngừng nhận tệp mới tại ngưỡng '||c.stop_percent||'%; tệp cũ vẫn giữ nguyên.');
  END LOOP;END IF;
 END LOOP;
 FOR p IN SELECT pr.id,coalesce(l.daily_bytes,209715200) daily_bytes,coalesce(l.daily_count,50) daily_count,coalesce(l.total_bytes,524288000) total_bytes FROM public.profiles pr LEFT JOIN public.storage_user_limits l ON l.user_id=pr.id WHERE pr.approval_status::text='active' LOOP
  SELECT coalesce(sum(size),0),count(*) INTO used,old_count FROM public.storage_upload_usage WHERE user_id=p.id AND created_at>now()-interval '1 day';
  SELECT coalesce(sum(size),0) INTO reserved FROM public.files WHERE uploaded_by=p.id;
  IF used>=p.daily_bytes*.8 OR old_count>=p.daily_count*.8 OR reserved>=p.total_bytes*.8 THEN
   PERFORM fpc_private.storage_notice(p.id,'storage:user-quota:'||current_date,'Bạn sắp chạm hạn mức tải lên','Xem dung lượng và số tệp còn lại trong Kho tài nguyên. Hãy dọn tệp không cần thiết hoặc liên hệ quản trị.');
  END IF;
  SELECT count(*) INTO old_count FROM public.files WHERE uploaded_by=p.id AND created_at<now()-interval '90 days';
  IF old_count>0 THEN PERFORM fpc_private.storage_notice(p.id,'storage:old-files:'||to_char(now(),'YYYY-MM'),'Nhắc xem lại ảnh và tệp cũ','Bạn có '||old_count||' tệp lưu quá 90 ngày. Chỉ xóa những tệp không còn cần thiết; hệ thống chưa tự xóa.');END IF;
 END LOOP;
 IF p_retention THEN
  INSERT INTO public.storage_retention_jobs(source_event_id,event_id,title,event_snapshot)
  SELECT e.id,e.id,e.title,to_jsonb(e) FROM public.events e WHERE e.end_time<now()-interval '90 days' ON CONFLICT(source_event_id) DO NOTHING;
  FOR j IN SELECT * FROM public.storage_retention_jobs WHERE state='review' LOOP
   FOR p IN SELECT pr.id FROM public.profiles pr WHERE pr.approval_status::text='active' AND (fpc_private.storage_admin(pr.id) OR pr.id=(j.event_snapshot->>'created_by')::uuid) LOOP
    PERFORM fpc_private.storage_notice(p.id,'storage:review:'||j.id::text,'Sự kiện cũ cần xem lại',j.title||' đã kết thúc quá 90 ngày. Chưa lên lịch xóa; cần quản trị duyệt trước.',j.event_id);
   END LOOP;
  END LOOP;
 END IF;
 RETURN jsonb_build_object('ok',true);
END;$$;
REVOKE ALL ON FUNCTION public.storage_refresh_governance(boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.storage_refresh_governance(boolean) TO service_role;

CREATE FUNCTION public.storage_retention_action(p_actor uuid,p_job uuid,p_action text,p_audience text DEFAULT 'related',p_reason text DEFAULT '')
RETURNS public.storage_retention_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.storage_retention_jobs;e public.events;r record;
BEGIN
 SELECT * INTO j FROM public.storage_retention_jobs WHERE id=p_job FOR UPDATE;
 SELECT * INTO e FROM public.events WHERE id=j.event_id FOR UPDATE;
 IF j.id IS NULL OR e.id IS NULL OR NOT fpc_private.storage_parent_access(p_actor,e.id,NULL,false) THEN RAISE EXCEPTION 'Retention access denied' USING ERRCODE='42501';END IF;
 IF p_action='hold' THEN
  IF j.state NOT IN('review','scheduled','retained','cancelled') THEN RAISE EXCEPTION 'Deletion already started' USING ERRCODE='22023';END IF;
  UPDATE public.storage_retention_jobs SET state='retained',hold_by=p_actor,hold_reason=left(p_reason,500),delete_after=NULL,updated_at=now() WHERE id=p_job RETURNING * INTO j;
 ELSIF p_action='approve' THEN
  IF NOT fpc_private.storage_admin(p_actor) OR j.state NOT IN('review','retained','cancelled') THEN RAISE EXCEPTION 'Admin approval required' USING ERRCODE='42501';END IF;
  IF e.end_time>=now()-interval '90 days' OR p_audience NOT IN('related','club') OR (p_audience='club' AND e.visibility<>'public') THEN RAISE EXCEPTION 'Invalid retention audience or age' USING ERRCODE='22023';END IF;
  UPDATE public.storage_retention_jobs SET state='scheduled',audience=p_audience,approved_by=p_actor,approved_at=now(),delete_after=now()+interval '7 days',event_snapshot=to_jsonb(e),hold_by=NULL,hold_reason=NULL,revision=revision+1,updated_at=now() WHERE id=p_job RETURNING * INTO j;
 ELSE RAISE EXCEPTION 'Invalid action' USING ERRCODE='22023';END IF;
 FOR r IN SELECT id FROM public.profiles WHERE approval_status::text='active' AND (fpc_private.storage_admin(id) OR (j.audience='club' AND e.visibility='public') OR (e.created_by=id) OR (e.visibility='department' AND EXISTS(SELECT 1 FROM public.department_members WHERE user_id=profiles.id AND department_id=e.department_id))) LOOP
  PERFORM fpc_private.storage_notice(r.id,'storage:retention:'||j.id::text||':'||j.revision||':'||j.state,
   CASE WHEN j.state='scheduled' THEN 'Sự kiện sắp bị xóa' ELSE 'Đã yêu cầu giữ lại sự kiện' END,
   e.title||CASE WHEN j.state='scheduled' THEN ' dự kiến xóa sau '||to_char(j.delete_after AT TIME ZONE 'Asia/Bangkok','DD/MM/YYYY HH24:MI')||'; sự kiện và tệp đính kèm sẽ bị xóa. Mở Kho tài nguyên để xem hoặc yêu cầu giữ lại.' ELSE ' đang được giữ lại, chưa tiếp tục xóa.' END,e.id);
 END LOOP;
 RETURN j;
END;$$;
REVOKE ALL ON FUNCTION public.storage_retention_action(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.storage_retention_action(uuid,uuid,text,text,text) TO service_role;

CREATE FUNCTION public.storage_retention_claim(p_job uuid) RETURNS public.storage_retention_jobs
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.storage_retention_jobs;e public.events;
BEGIN
 SELECT * INTO j FROM public.storage_retention_jobs WHERE id=p_job FOR UPDATE;
 IF j.id IS NULL OR j.state NOT IN('scheduled','failed') OR j.delete_after IS NULL OR j.delete_after>now() OR NOT fpc_private.storage_admin(j.approved_by) THEN RAISE EXCEPTION 'Retention not approved or not due' USING ERRCODE='42501';END IF;
 SELECT * INTO e FROM public.events WHERE id=j.event_id FOR UPDATE;
 IF e.id IS NULL OR e.end_time>=now()-interval '90 days' OR to_jsonb(e) IS DISTINCT FROM j.event_snapshot THEN
  UPDATE public.storage_retention_jobs SET state='cancelled',last_error='Sự kiện đã thay đổi; cần duyệt lại',updated_at=now() WHERE id=p_job RETURNING * INTO j;RETURN j;
 END IF;
 UPDATE public.storage_retention_jobs SET state='deleting',updated_at=now() WHERE id=p_job RETURNING * INTO j;
 RETURN j;
END;$$;
CREATE FUNCTION fpc_private.freeze_retention_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.storage_retention_jobs WHERE event_id=OLD.id AND state IN('deleting','failed')) AND coalesce(current_setting('fpc.retention_finish',true),'')<>OLD.id::text THEN RAISE EXCEPTION 'Event cleanup in progress' USING ERRCODE='42501';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END;$$;
REVOKE ALL ON FUNCTION fpc_private.freeze_retention_event() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER freeze_retention_event BEFORE UPDATE OR DELETE ON public.events FOR EACH ROW EXECUTE FUNCTION fpc_private.freeze_retention_event();
CREATE FUNCTION public.storage_retention_finish(p_job uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.storage_retention_jobs;
BEGIN
 SELECT * INTO j FROM public.storage_retention_jobs WHERE id=p_job FOR UPDATE;
 IF j.state IS DISTINCT FROM 'deleting' OR EXISTS(SELECT 1 FROM public.files WHERE event_id=j.event_id) OR EXISTS(SELECT 1 FROM public.storage_uploads WHERE event_id=j.event_id AND (completed_at IS NULL OR (provider='b2' AND versions_cleaned_at IS NULL))) THEN RAISE EXCEPTION 'Cleanup is not complete' USING ERRCODE='42501';END IF;
 PERFORM set_config('fpc.retention_finish',j.event_id::text,true);
 DELETE FROM public.events WHERE id=j.event_id;
 UPDATE public.storage_retention_jobs SET state='deleted',updated_at=now(),last_error=NULL WHERE id=p_job;
END;$$;
REVOKE ALL ON FUNCTION public.storage_retention_claim(uuid),public.storage_retention_finish(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.storage_retention_claim(uuid),public.storage_retention_finish(uuid) TO service_role;
CREATE INDEX retention_due_jobs ON public.storage_retention_jobs(state,delete_after);
CREATE INDEX notifications_event ON public.notifications(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX retention_approver ON public.storage_retention_jobs(approved_by);
CREATE INDEX retention_hold_user ON public.storage_retention_jobs(hold_by);
CREATE FUNCTION public.storage_is_admin(p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT fpc_private.storage_admin(p_user); $$;
REVOKE ALL ON FUNCTION public.storage_is_admin(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.storage_is_admin(uuid) TO service_role;
CREATE FUNCTION public.storage_overview(p_actor uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT fpc_private.storage_parent_access(p_actor,NULL,NULL,false) THEN RAISE EXCEPTION 'Active membership required' USING ERRCODE='42501';END IF;
 SELECT jsonb_build_object('admin',fpc_private.storage_admin(p_actor),
 'connections',coalesce((SELECT jsonb_agg(to_jsonb(c)||jsonb_build_object('used',coalesce((SELECT sum(size) FROM public.files WHERE storage_connection_id=c.id),0),'reserved',coalesce((SELECT sum(size) FROM public.storage_uploads WHERE storage_connection_id=c.id AND completed_at IS NULL),0))) FROM public.storage_connections c WHERE fpc_private.storage_admin(p_actor)),'[]'::jsonb),
 'users',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'enabled',coalesce(l.enabled,true),'max_file_bytes',coalesce(l.max_file_bytes,104857600),'daily_bytes',coalesce(l.daily_bytes,209715200),'daily_count',coalesce(l.daily_count,50),'total_bytes',coalesce(l.total_bytes,524288000),'used',coalesce((SELECT sum(size) FROM public.files WHERE uploaded_by=p.id),0),'reserved',coalesce((SELECT sum(size) FROM public.storage_uploads WHERE owner_id=p.id AND completed_at IS NULL),0),'day_bytes',coalesce((SELECT sum(size) FROM public.storage_upload_usage WHERE user_id=p.id AND created_at>now()-interval '1 day'),0),'day_count',(SELECT count(*) FROM public.storage_upload_usage WHERE user_id=p.id AND created_at>now()-interval '1 day'))) FROM public.profiles p LEFT JOIN public.storage_user_limits l ON l.user_id=p.id WHERE p.id=p_actor OR (p.approval_status::text='active' AND fpc_private.storage_admin(p_actor))),'[]'::jsonb),
 'jobs',coalesce((SELECT jsonb_agg(jsonb_build_object('id',j.id,'event_id',j.event_id,'title',j.title,'state',j.state,'audience',j.audience,'delete_after',j.delete_after,'hold_reason',j.hold_reason,'visibility',j.event_snapshot->>'visibility','last_error',j.last_error)) FROM public.storage_retention_jobs j WHERE (j.state<>'deleted' AND j.event_id IS NOT NULL AND fpc_private.storage_parent_access(p_actor,j.event_id,NULL,false)) OR (j.state='deleted' AND fpc_private.storage_admin(p_actor))),'[]'::jsonb)
 ) INTO result;
 RETURN result;
END;$$;
REVOKE ALL ON FUNCTION public.storage_overview(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.storage_overview(uuid) TO service_role;
COMMIT;
