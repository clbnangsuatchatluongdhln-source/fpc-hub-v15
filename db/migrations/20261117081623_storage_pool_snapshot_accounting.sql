BEGIN;
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
 SELECT (SELECT coalesce(sum(size),0) FROM public.files WHERE uploaded_by=u.owner_id),(SELECT coalesce(sum(size),0) FROM public.storage_uploads WHERE owner_id=u.owner_id AND completed_at IS NULL) INTO used,reserved;
 IF NOT limits.enabled OR u.size>limits.max_file_bytes OR day_bytes+u.size>limits.daily_bytes OR day_count>=limits.daily_count OR used+reserved+u.size>limits.total_bytes
 OR (SELECT count(*) FROM public.storage_upload_usage WHERE user_id=u.owner_id AND created_at>now()-interval '10 minutes')>=20 THEN RAISE EXCEPTION 'User upload quota reached' USING ERRCODE='P0001'; END IF;
 IF p_upload ? 'candidate_ids' THEN SELECT array_agg(value::uuid) INTO conn_ids FROM jsonb_array_elements_text(p_upload->'candidate_ids');
 ELSE SELECT array_agg(id) INTO conn_ids FROM public.storage_connections WHERE provider=p_upload->>'provider' AND bucket=p_upload->>'bucket';END IF;
 FOR c IN SELECT * FROM public.storage_connections WHERE id=ANY(conn_ids) AND write_enabled
 AND CASE u.kind WHEN 'image' THEN image_priority WHEN 'document' THEN document_priority ELSE video_priority END IS NOT NULL
 ORDER BY CASE u.kind WHEN 'image' THEN image_priority WHEN 'document' THEN document_priority ELSE video_priority END,id FOR UPDATE LOOP
   SELECT (SELECT coalesce(sum(size),0) FROM public.files WHERE storage_connection_id=c.id),(SELECT coalesce(sum(size),0) FROM public.storage_uploads WHERE storage_connection_id=c.id AND completed_at IS NULL) INTO used,reserved;
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

COMMIT;
