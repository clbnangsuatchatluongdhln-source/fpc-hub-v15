BEGIN;
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
    OR NOT fpc_private.storage_parent_access(u.owner_id,u.event_id,u.project_id,true)
  THEN RAISE EXCEPTION 'Metadata requires a verified server upload session' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION fpc_private.guard_storage_metadata() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER storage_metadata_provenance BEFORE INSERT ON public.files
FOR EACH ROW EXECUTE FUNCTION fpc_private.guard_storage_metadata();
COMMIT;
