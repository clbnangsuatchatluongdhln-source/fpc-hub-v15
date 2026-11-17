import {supabaseAdmin} from './supabase';
import {cleanupExpiredUploads} from './storage-cleanup';
import {deleteStoredObject} from './storage-delete';
import type {StoredFileRow} from './storage';

export async function runStorageMaintenance(options:{signal?:AbortSignal}={}) {
 const uploads=await cleanupExpiredUploads(20,options.signal);
 if(options.signal?.aborted)return {uploads,deleted:0,failed:0,deferred:true};
 const refresh=await supabaseAdmin.rpc('storage_refresh_governance',{p_retention:true});
 if(refresh.error)throw new Error('Governance refresh failed');
 const now=new Date().toISOString();
 const stale=new Date(Date.now()-30*60000).toISOString();
 const recovery=await supabaseAdmin.from('storage_retention_jobs').update({state:'failed',last_error:'Worker interrupted; retry pending'}).eq('state','deleting').lt('updated_at',stale);
 if(recovery.error)throw new Error('Cannot recover retention workers');
 const {data,error}=await supabaseAdmin.from('storage_retention_jobs').select('id,event_id').in('state',['scheduled','failed']).lte('delete_after',now).order('delete_after').limit(10);
 if(error)throw new Error('Cannot list retention');
 let deleted=0,failed=0;
 for(const candidate of data??[]) {
  if(options.signal?.aborted)break;
  let claimed=false;
  try {
   const result=await supabaseAdmin.rpc('storage_retention_claim',{p_job:candidate.id});
   if(result.error || result.data?.state!=='deleting')continue;
   claimed=true;
   const pending=await supabaseAdmin.from('storage_uploads').select('id',{count:'exact',head:true}).eq('event_id',candidate.event_id).or('completed_at.is.null,and(provider.eq.b2,versions_cleaned_at.is.null)');
   if(pending.error || pending.count)throw new Error('Upload cleanup pending');
   const files=await supabaseAdmin.from('files').select('*').eq('event_id',candidate.event_id).limit(10);
   if(files.error)throw new Error('Cannot list event files');
   for(const file of (files.data??[]) as StoredFileRow[]) {
    options.signal?.throwIfAborted();
    await deleteStoredObject(file,options.signal);
    const removal=await supabaseAdmin.from('files').delete().eq('id',file.id).eq('event_id',candidate.event_id);
    if(removal.error)throw new Error('Metadata cleanup failed');
   }
   const left=await supabaseAdmin.from('files').select('id',{count:'exact',head:true}).eq('event_id',candidate.event_id);
   if(left.error)throw new Error('Cannot verify cleanup');
   if(left.count){await supabaseAdmin.from('storage_retention_jobs').update({state:'failed',last_error:'More files pending',updated_at:new Date().toISOString()}).eq('id',candidate.id);continue;}
   const finish=await supabaseAdmin.rpc('storage_retention_finish',{p_job:candidate.id});
   if(finish.error)throw new Error('Cannot finish retention');
   deleted++;
  }catch{
   failed++;
   if(claimed)await supabaseAdmin.from('storage_retention_jobs').update({state:'failed',last_error:'Cleanup chưa hoàn tất; dữ liệu sự kiện được giữ để thử lại',updated_at:new Date().toISOString()}).eq('id',candidate.id).eq('state','deleting');
  }
 }
 return {uploads,deleted,failed};
}
