BEGIN;

CREATE SCHEMA IF NOT EXISTS fpc_private;
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS original_size bigint;
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS storage_provider text;
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS storage_bucket text;
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS file_type text DEFAULT 'file';
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS public_url text;
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS saved_pct integer DEFAULT 0;
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION fpc_private.storage_parent_access(p_user uuid, p_event uuid, p_project uuid, p_write boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.profiles; e public.events; j public.projects; manager boolean;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = p_user;
  IF p.id IS NULL OR p.approval_status::text <> 'active' THEN RETURN false; END IF;
  manager := p.role::text IN ('admin','super_admin') OR coalesce(to_jsonb(p)->>'club_position','') IN ('president','vice_president');
  IF p_event IS NOT NULL THEN
    SELECT * INTO e FROM public.events WHERE id = p_event;
    IF e.id IS NULL THEN RETURN false; END IF;
    IF NOT coalesce(manager OR e.created_by = p_user OR (NOT p_write AND (e.visibility = 'public' OR (e.visibility = 'department' AND EXISTS (SELECT 1 FROM public.department_members WHERE department_id=e.department_id AND user_id=p_user)))),false) THEN RETURN false; END IF;
  END IF;
  IF p_project IS NOT NULL THEN
    SELECT * INTO j FROM public.projects WHERE id = p_project;
    IF j.id IS NULL THEN RETURN false; END IF;
    IF NOT coalesce(manager OR j.owner_id=p_user OR j.head_id=p_user OR p_user=ANY(j.members)
      OR EXISTS (SELECT 1 FROM public.departments WHERE id=j.department_id AND head_id=p_user)
      OR (NOT p_write AND EXISTS (SELECT 1 FROM public.department_members WHERE department_id=j.department_id AND user_id=p_user)),false) THEN RETURN false; END IF;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION fpc_private.storage_parent_access(uuid,uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA fpc_private TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION fpc_private.storage_parent_access(uuid,uuid,uuid,boolean) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.storage_parent_allowed(p_user uuid,p_event uuid,p_project uuid,p_write boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT fpc_private.storage_parent_access(p_user,p_event,p_project,p_write);
$$;
REVOKE ALL ON FUNCTION public.storage_parent_allowed(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.storage_parent_allowed(uuid,uuid,uuid,boolean) TO service_role;

CREATE TABLE public.storage_uploads (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  provider text NOT NULL CHECK(provider IN ('tigris','b2','imagekit')),
  bucket text NOT NULL,
  storage_path text NOT NULL,
  name text NOT NULL,
  mime_type text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('image','video','document')),
  size bigint NOT NULL CHECK(size BETWEEN 1 AND 104857600),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',
  completed_at timestamptz,
  file_id uuid REFERENCES public.files(id) ON DELETE SET NULL,
  UNIQUE(provider,bucket,storage_path),
  CHECK(event_id IS NULL OR project_id IS NULL)
);
CREATE INDEX storage_uploads_owner_created ON public.storage_uploads(owner_id,created_at);
CREATE INDEX storage_uploads_provider ON public.storage_uploads(provider);
ALTER TABLE public.storage_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storage_uploads FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.storage_uploads TO service_role;

CREATE OR REPLACE FUNCTION public.storage_issue_upload(p_upload jsonb)
RETURNS public.storage_uploads LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u public.storage_uploads; bytes_used bigint; provider_limit bigint;
BEGIN
  u.id := (p_upload->>'id')::uuid;
  u.owner_id := (p_upload->>'owner_id')::uuid;
  u.provider := p_upload->>'provider'; u.bucket := p_upload->>'bucket'; u.storage_path := p_upload->>'storage_path';
  u.name := p_upload->>'name'; u.mime_type := p_upload->>'mime_type'; u.kind := p_upload->>'kind'; u.size := (p_upload->>'size')::bigint;
  u.event_id := (p_upload->>'event_id')::uuid; u.project_id := (p_upload->>'project_id')::uuid;
  IF NOT fpc_private.storage_parent_access(u.owner_id,u.event_id,u.project_id,true) THEN RAISE EXCEPTION 'Parent permission denied' USING ERRCODE='42501'; END IF;
  IF u.size NOT BETWEEN 1 AND 104857600 OR (u.kind='image' AND u.size>10485760) THEN RAISE EXCEPTION 'File too large' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('storage-quota:'||u.provider));
  PERFORM pg_advisory_xact_lock(hashtext('storage-user:'||u.owner_id::text));
  IF (SELECT count(*) FROM public.storage_uploads WHERE owner_id=u.owner_id AND created_at>now()-interval '10 minutes') >= 20 THEN RAISE EXCEPTION 'Upload rate limit' USING ERRCODE='P0001'; END IF;
  IF coalesce((SELECT sum(size) FROM public.storage_uploads WHERE owner_id=u.owner_id AND created_at>now()-interval '1 day'),0)+u.size>209715200 THEN RAISE EXCEPTION 'Daily upload quota' USING ERRCODE='P0001'; END IF;
  provider_limit := CASE u.provider WHEN 'tigris' THEN 4294967296 WHEN 'b2' THEN 8589934592 WHEN 'imagekit' THEN 2147483648 ELSE 0 END;
  SELECT coalesce(sum(size),0) INTO bytes_used FROM public.files WHERE storage_provider=u.provider;
  bytes_used := bytes_used+coalesce((SELECT sum(size) FROM public.storage_uploads WHERE provider=u.provider AND completed_at IS NULL),0);
  IF bytes_used+u.size>provider_limit THEN RAISE EXCEPTION 'Provider upload quota' USING ERRCODE='P0001'; END IF;
  INSERT INTO public.storage_uploads(id,owner_id,provider,bucket,storage_path,name,mime_type,kind,size,event_id,project_id)
  VALUES(u.id,u.owner_id,u.provider,u.bucket,u.storage_path,u.name,u.mime_type,u.kind,u.size,u.event_id,u.project_id) RETURNING * INTO u;
  RETURN u;
END;
$$;

CREATE OR REPLACE FUNCTION public.storage_finalize_upload(p_id uuid,p_owner uuid,p_object_id text)
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
  IF (u.provider<>'imagekit' AND p_object_id<>u.storage_path) OR p_object_id IS NULL OR p_object_id='' THEN RAISE EXCEPTION 'Object mismatch' USING ERRCODE='22023'; END IF;
  INSERT INTO public.files(id,name,size,original_size,mime_type,kind,storage_provider,storage_bucket,file_type,storage_path,public_url,uploaded_by,event_id,project_id,saved_pct)
  VALUES(u.id,u.name,u.size,u.size,u.mime_type,u.kind,u.provider,u.bucket,'file',p_object_id,'',u.owner_id,u.event_id,u.project_id,0) RETURNING * INTO f;
  UPDATE public.storage_uploads SET completed_at=now(),file_id=f.id WHERE id=u.id;
  RETURN f;
END;
$$;
REVOKE ALL ON FUNCTION public.storage_issue_upload(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.storage_finalize_upload(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.storage_issue_upload(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.storage_finalize_upload(uuid,uuid,text) TO service_role;

REVOKE INSERT,UPDATE ON public.files FROM anon,authenticated;
DROP POLICY IF EXISTS storage_metadata_insert_guard ON public.files;
CREATE POLICY storage_metadata_insert_guard ON public.files AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(false);
DROP POLICY IF EXISTS storage_metadata_update_guard ON public.files;
CREATE POLICY storage_metadata_update_guard ON public.files AS RESTRICTIVE FOR UPDATE TO authenticated USING(false) WITH CHECK(false);
DROP POLICY IF EXISTS storage_parent_read_guard ON public.files;
CREATE POLICY storage_parent_read_guard ON public.files AS RESTRICTIVE FOR SELECT TO authenticated
USING(fpc_private.storage_parent_access((SELECT auth.uid()),event_id,project_id,false));

COMMIT;
