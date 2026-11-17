BEGIN;
ALTER TABLE public.files ADD COLUMN storage_version text;
ALTER TABLE public.storage_uploads ADD COLUMN storage_version text;
ALTER TABLE public.storage_uploads ADD COLUMN versions_cleaned_at timestamptz;

CREATE FUNCTION public.storage_finalize_upload(p_id uuid,p_owner uuid,p_object_id text,p_version text)
RETURNS public.files LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u public.storage_uploads; f public.files;
BEGIN
  SELECT * INTO u FROM public.storage_uploads WHERE id=p_id FOR UPDATE;
  IF u.id IS NULL OR u.owner_id<>p_owner OR NOT fpc_private.storage_parent_access(p_owner,u.event_id,u.project_id,true) THEN RAISE EXCEPTION 'Upload permission denied' USING ERRCODE='42501'; END IF;
  IF u.completed_at IS NOT NULL THEN
    SELECT * INTO f FROM public.files WHERE id=u.file_id;
    IF f.id IS NULL THEN RAISE EXCEPTION 'Upload already removed' USING ERRCODE='22023'; END IF;
    RETURN f;
  END IF;
  IF u.expires_at<=now() THEN RAISE EXCEPTION 'Upload expired' USING ERRCODE='22023'; END IF;
  IF (u.provider<>'imagekit' AND p_object_id IS DISTINCT FROM u.storage_path) OR p_object_id IS NULL OR p_object_id='' THEN RAISE EXCEPTION 'Object mismatch' USING ERRCODE='22023'; END IF;
  IF (u.provider='b2' AND (p_version IS NULL OR p_version!~'^[A-Za-z0-9_-]{10,300}$')) OR (u.provider<>'b2' AND p_version IS NOT NULL) THEN RAISE EXCEPTION 'Invalid object version' USING ERRCODE='22023'; END IF;
  INSERT INTO public.files(id,name,size,original_size,mime_type,kind,storage_provider,storage_bucket,storage_version,file_type,storage_path,public_url,uploaded_by,event_id,project_id,saved_pct)
  VALUES(u.id,u.name,u.size,u.size,u.mime_type,u.kind,u.provider,u.bucket,p_version,'file',p_object_id,'',u.owner_id,u.event_id,u.project_id,0) RETURNING * INTO f;
  UPDATE public.storage_uploads SET completed_at=now(),file_id=f.id,storage_version=p_version WHERE id=u.id;
  RETURN f;
END;
$$;
REVOKE ALL ON FUNCTION public.storage_finalize_upload(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.storage_finalize_upload(uuid,uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.storage_finalize_upload(p_id uuid,p_owner uuid,p_object_id text)
RETURNS public.files LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.storage_finalize_upload(p_id,p_owner,p_object_id,NULL);
$$;
REVOKE ALL ON FUNCTION public.storage_finalize_upload(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.storage_finalize_upload(uuid,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION fpc_private.guard_storage_metadata()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u public.storage_uploads;
BEGIN
  IF session_user IN ('postgres','supabase_admin') THEN RETURN NEW; END IF;
  SELECT * INTO u FROM public.storage_uploads WHERE id=NEW.id;
  IF u.id IS NULL OR u.completed_at IS NOT NULL OR u.expires_at<=now()
    OR NEW.uploaded_by IS DISTINCT FROM u.owner_id OR NEW.storage_provider IS DISTINCT FROM u.provider
    OR NEW.storage_bucket IS DISTINCT FROM u.bucket OR NEW.name IS DISTINCT FROM u.name
    OR NEW.size IS DISTINCT FROM u.size OR NEW.original_size IS DISTINCT FROM u.size
    OR NEW.mime_type IS DISTINCT FROM u.mime_type OR NEW.kind IS DISTINCT FROM u.kind
    OR NEW.event_id IS DISTINCT FROM u.event_id OR NEW.project_id IS DISTINCT FROM u.project_id
    OR NEW.file_type IS DISTINCT FROM 'file' OR coalesce(NEW.public_url,'')<>''
    OR (u.provider<>'imagekit' AND NEW.storage_path IS DISTINCT FROM u.storage_path)
    OR NEW.storage_path IS NULL OR NEW.storage_path=''
    OR (u.provider='b2' AND (NEW.storage_version IS NULL OR NEW.storage_version!~'^[A-Za-z0-9_-]{10,300}$'))
    OR (u.provider<>'b2' AND NEW.storage_version IS NOT NULL)
    OR NOT fpc_private.storage_parent_access(u.owner_id,u.event_id,u.project_id,true)
  THEN RAISE EXCEPTION 'Metadata requires a verified server upload session' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END;
$$;
COMMIT;
