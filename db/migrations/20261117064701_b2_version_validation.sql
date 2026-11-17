BEGIN;
DO $$
DECLARE target regprocedure; definition text;
BEGIN
  FOREACH target IN ARRAY ARRAY['public.storage_finalize_upload(uuid,uuid,text,text)'::regprocedure,'fpc_private.guard_storage_metadata()'::regprocedure] LOOP
    SELECT pg_get_functiondef(target) INTO definition;
    IF position('{10,300}' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected version validation definition'; END IF;
    EXECUTE replace(definition,'{10,300}','{10,200}');
  END LOOP;
END;
$$;
COMMIT;
