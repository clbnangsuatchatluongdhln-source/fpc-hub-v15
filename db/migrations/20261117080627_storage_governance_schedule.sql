BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('fpc-storage-governance','0 2 * * *',$job$SELECT public.storage_refresh_governance(true); DELETE FROM public.storage_upload_usage WHERE created_at<now()-interval '30 days';$job$);
COMMIT;
