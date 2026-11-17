import {connectionConfig,type StorageConnection} from './storage-connections';
import { S3Client } from '@aws-sdk/client-s3';
import { supabaseAdmin, verifyUser } from './supabase';
import { mayDeleteFile } from './storage-policy';

export class StorageError extends Error {
  status:number;
  constructor(message:string,status=400){super(message);this.status=status;}
}

export interface StoredFileRow {
  id:string; storage_path:string; storage_provider?:string|null; storage_bucket?:string|null;
  storage_version?:string|null; storage_connection_id?:string|null;
  file_type?:string|null; kind?:string|null; public_url?:string|null; uploaded_by?:string|null;
  event_id?:string|null; project_id?:string|null;
}

export async function authorizedFile(auth:string|undefined,input:{fileId?:string;storagePath?:string},action:'read'|'delete') {
  const user=await verifyUser(auth);
  if(!user)throw new StorageError('Cần đăng nhập',401);
  const {data:profile,error:profileError}=await supabaseAdmin.from('profiles').select('*').eq('id',user.id).single();
  if(profileError || profile?.approval_status!=='active')throw new StorageError('Tài khoản chưa được duyệt',403);
  if(!input.fileId && !input.storagePath)throw new StorageError('Thiếu mã tệp');
  if(input.fileId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.fileId))throw new StorageError('Mã tệp không hợp lệ');
  let query=supabaseAdmin.from('files').select('*');
  query=input.fileId?query.eq('id',input.fileId):query.eq('storage_path',input.storagePath!);
  const {data,error}=await query.maybeSingle();
  if(error || !data)throw new StorageError('Không tìm thấy tệp',404);
  const file=data as StoredFileRow;
  const reader={id:user.id,approval_status:profile.approval_status as string};
  if(action==='delete') {
    if(!mayDeleteFile(reader,file))throw new StorageError('Chỉ người tải lên được xóa tệp này',403);
    return file;
  }
  const {data:allowed,error:accessError}=await supabaseAdmin.rpc('storage_parent_allowed',{
    p_user:user.id,p_event:file.event_id??null,p_project:file.project_id??null,p_write:false});
  if(accessError || allowed!==true) {
    throw new StorageError('Không có quyền xem tệp',403);
  }
  return file;
}

export function fileLocation(file:StoredFileRow) {
  const kind=file.kind;
  const provider=file.storage_provider || (kind==='image'?'imagekit':kind==='video'?'supabase':'b2');
  if(!['b2','r2','tigris','imagekit','supabase'].includes(provider))throw new StorageError('Nơi lưu tệp chưa được hỗ trợ');
  const legacyVideo=kind==='video' && file.storage_path.startsWith('videos/');
  return {provider,bucket:file.storage_bucket || (legacyVideo?process.env.SUPABASE_VIDEO_BUCKET || 'fpc-files':file.file_type==='file'?'files':process.env.SUPABASE_VIDEO_BUCKET || 'fpc-files')};
}

export function objectStore(provider:string,connection?:StorageConnection) {
  if(!['b2','r2','tigris'].includes(provider))throw new StorageError('Kho không hợp lệ');
  if(connection) {
    if(connection.provider!==provider || provider==='imagekit')throw new StorageError('Sai kết nối kho',409);
    const c=connectionConfig(connection);
    if(!('key' in c) || !c.key || !c.secret)throw new StorageError('Kho thiếu cấu hình',503);
    return {bucket:c.bucket,client:new S3Client({endpoint:c.endpoint,region:c.region,credentials:{accessKeyId:c.key,secretAccessKey:c.secret},maxAttempts:2,requestHandler:{connectionTimeout:10000,requestTimeout:20000}})};
  }
  const prefix=provider==='r2'?'R2':provider==='tigris'?'TIGRIS_STORAGE':'B2';
  const endpoint=process.env[`${prefix}_ENDPOINT`],key=process.env[`${prefix}_${provider==='tigris'?'ACCESS_KEY_ID':'KEY_ID'}`],secret=process.env[`${prefix}_${provider==='tigris'?'SECRET_ACCESS_KEY':'APPLICATION_KEY'}`],bucket=process.env[`${prefix}_BUCKET`];
  if(!endpoint || !key || !secret || !bucket)throw new StorageError('Kho tệp chưa được cấu hình',503);
  return {bucket,client:new S3Client({endpoint,region:process.env[`${prefix}_REGION`] || (provider==='b2'?'us-east-1':'auto'),credentials:{accessKeyId:key,secretAccessKey:secret},maxAttempts:2,requestHandler:{connectionTimeout:10000,requestTimeout:20000}})};
}
