BEGIN;
ALTER TABLE public.storage_connections ADD COLUMN endpoint_url text;
UPDATE public.storage_connections SET endpoint_url=CASE provider WHEN 'imagekit' THEN 'https://ik.imagekit.io/fpchub' WHEN 'tigris' THEN 'https://t3.storage.dev' WHEN 'b2' THEN 'https://s3.eu-central-003.backblazeb2.com' END;
ALTER TABLE public.storage_connections ALTER COLUMN endpoint_url SET NOT NULL;
ALTER TABLE public.storage_connections ADD CONSTRAINT storage_endpoint_https CHECK(endpoint_url~'^https://' AND right(endpoint_url,1)<>'/');
ALTER TABLE public.storage_connections ADD CONSTRAINT storage_connection_unique_origin UNIQUE(provider,endpoint_url,bucket);
CREATE OR REPLACE FUNCTION fpc_private.freeze_storage_connection() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF (NEW.provider IS DISTINCT FROM OLD.provider OR NEW.bucket IS DISTINCT FROM OLD.bucket OR NEW.env_prefix IS DISTINCT FROM OLD.env_prefix OR NEW.endpoint_url IS DISTINCT FROM OLD.endpoint_url)
 AND (EXISTS(SELECT 1 FROM public.files WHERE storage_connection_id=OLD.id) OR EXISTS(SELECT 1 FROM public.storage_uploads WHERE storage_connection_id=OLD.id))
 THEN RAISE EXCEPTION 'Cannot repoint a connection with stored files' USING ERRCODE='22023';END IF;
 RETURN NEW;
END;$$;
COMMIT;
