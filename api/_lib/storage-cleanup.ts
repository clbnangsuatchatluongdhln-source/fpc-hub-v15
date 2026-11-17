import {loadConnection,imageConfig} from './storage-connections';
import {DeleteObjectCommand,ListObjectVersionsCommand} from '@aws-sdk/client-s3';
import {supabaseAdmin} from './supabase';
import {objectStore} from './storage';
import type {UploadSession} from './upload-session';

export async function cleanupExpiredUploads(limit=20,signal?:AbortSignal) {
  const cutoff=new Date(Date.now()-60000).toISOString();
  const {data,error}=await supabaseAdmin.from('storage_uploads').select('*').or('completed_at.is.null,and(provider.eq.b2,versions_cleaned_at.is.null)').lt('expires_at',cutoff).limit(Math.min(limit,50));
  if(error)throw new Error('Cannot list expired uploads');
  let removed=0,failed=0;
  for(const session of (data??[]) as UploadSession[]) {
    if(signal?.aborted)break;
    try {
      const connection=await loadConnection(session);
      if(session.provider==='imagekit') {
        const index=session.storage_path.lastIndexOf('/');
        const query=new URLSearchParams({path:session.storage_path.slice(0,index),searchQuery:`name = ${JSON.stringify(session.storage_path.slice(index+1))}`,limit:'1000'});
        const headers={Authorization:`Basic ${Buffer.from(imageConfig(connection).privateKey+':').toString('base64')}`};
        const response=await fetch(`https://api.imagekit.io/v1/files?${query}`,{headers,signal:signal??AbortSignal.timeout(15000)});
        if(!response.ok)throw new Error('Image lookup failed');
        const matches=await response.json() as {fileId:string;filePath:string}[];
        if(!Array.isArray(matches))throw new Error('Invalid image lookup');
        for(const match of matches) {
          if(match.filePath!==session.storage_path)continue;
          const deletion=await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(match.fileId)}`,{method:'DELETE',headers,signal:signal??AbortSignal.timeout(15000)});
          if(!deletion.ok && deletion.status!==404)throw new Error('Image deletion failed');
        }
      } else {
        const store=objectStore(session.provider,connection);
        try {
          if(store.bucket!==session.bucket)throw new Error('Bucket changed');
          if(session.provider==='b2') {
            let complete=false;
            for(let page=0;page<20;page++) {
              const listed=await store.client.send(new ListObjectVersionsCommand({Bucket:session.bucket,Prefix:session.storage_path,MaxKeys:1000}),{abortSignal:signal});
              const versions=[...(listed.Versions??[]),...(listed.DeleteMarkers??[])].filter(item=>item.Key===session.storage_path && item.VersionId && !(session.file_id && item.VersionId===session.storage_version));
              for(const item of versions)await store.client.send(new DeleteObjectCommand({Bucket:session.bucket,Key:session.storage_path,VersionId:item.VersionId}),{abortSignal:signal});
              if(!listed.IsTruncated){complete=true;break;}
              if(!versions.length)break;
            }
            if(!complete)throw new Error('B2 cleanup requires another pass');
          } else await store.client.send(new DeleteObjectCommand({Bucket:session.bucket,Key:session.storage_path}),{abortSignal:signal});
        } finally {store.client.destroy();}
      }
      const result=session.completed_at
        ?await supabaseAdmin.from('storage_uploads').update({versions_cleaned_at:new Date().toISOString()}).eq('id',session.id)
        :await supabaseAdmin.from('storage_uploads').delete().eq('id',session.id).is('completed_at',null).lt('expires_at',cutoff);
      if(result.error)throw new Error('Reservation deletion failed');
      removed++;
    } catch {failed++;}
  }
  return {removed,failed};
}
