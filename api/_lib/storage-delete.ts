import {DeleteObjectCommand} from '@aws-sdk/client-s3';
import {supabaseAdmin} from './supabase';
import {fileLocation,objectStore,StorageError,type StoredFileRow} from './storage';
import {loadConnection,imageConfig} from './storage-connections';

export async function deleteStoredObject(file:StoredFileRow,signal?:AbortSignal) {
 const location=fileLocation(file),connection=await loadConnection(file);
 if(location.provider==='imagekit') {
  const config=imageConfig(connection);
  const response=await fetch('https://api.imagekit.io/v1/files/'+encodeURIComponent(file.storage_path),{
   method:'DELETE',headers:{Authorization:'Basic '+Buffer.from(config.privateKey+':').toString('base64')},signal:signal??AbortSignal.timeout(15000)});
  if(!response.ok && response.status!==404)throw new StorageError('Chưa xóa được ảnh',503);
 } else if(location.provider==='supabase') {
  const {error}=await supabaseAdmin.storage.from(location.bucket).remove([file.storage_path]);if(error)throw new StorageError('Chưa xóa được tệp',503);
 } else {
  const store=objectStore(location.provider,connection);
  try {
   if(file.storage_bucket && file.storage_bucket!==store.bucket)throw new StorageError('Bucket không khớp',409);
   await store.client.send(new DeleteObjectCommand({Bucket:store.bucket,Key:file.storage_path,VersionId:file.storage_version??undefined}),{abortSignal:signal});
  } finally {store.client.destroy();}
 }
}
