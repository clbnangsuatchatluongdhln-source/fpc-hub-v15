import {loadConnection,imageConfig,type StorageConnection} from './storage-connections';
import crypto from 'node:crypto';
import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { supabaseAdmin, verifyUser } from './supabase';
import { objectStore, StorageError } from './storage';

export interface UploadSession {
  id:string; owner_id:string; provider:'tigris'|'b2'|'imagekit'; bucket:string;
  storage_path:string; name:string; mime_type:string; kind:'image'|'video'|'document'; size:number;
  event_id:string|null; project_id:string|null; expires_at:string; completed_at:string|null; file_id:string|null;
  storage_version?:string|null; storage_connection_id?:string|null; versions_cleaned_at?:string|null;
}

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const imageTypes = ['image/jpeg','image/png','image/webp','image/gif','image/avif'];

export async function activeUploader(auth:string|undefined):Promise<string> {
  const user=await verifyUser(auth);
  if(!user)throw new StorageError('Cần đăng nhập',401);
  const {data,error}=await supabaseAdmin.from('profiles').select('approval_status').eq('id',user.id).single();
  if(error || data?.approval_status!=='active')throw new StorageError('Tài khoản chưa được duyệt',403);
  return user.id;
}

export function uploadInput(body:unknown) {
  if(!body || typeof body!=='object' || Array.isArray(body))throw new StorageError('Dữ liệu upload không hợp lệ');
  const b=body as Record<string,unknown>;
  if(Object.keys(b).some(key=>!['fileName','fileType','size','context','parentId'].includes(key)))throw new StorageError('Không được tự chọn kho hoặc đường dẫn upload');
  if(typeof b.fileName!=='string' || !b.fileName.trim() || b.fileName.length>200 || /[\x00-\x1f/\\]/.test(b.fileName))throw new StorageError('Tên tệp không hợp lệ');
  if(typeof b.size!=='number' || !Number.isSafeInteger(b.size) || b.size<1 || b.size>100*1024*1024)throw new StorageError('Chọn tệp từ 1 byte đến 100 MB');
  const mime=typeof b.fileType==='string'?b.fileType:'application/octet-stream';
  if(!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(mime))throw new StorageError('Loại tệp không hợp lệ');
  const kind=imageTypes.includes(mime)?'image':mime.startsWith('video/')?'video':'document';
  if(mime.startsWith('image/') && kind!=='image')throw new StorageError('Chỉ hỗ trợ ảnh JPG, PNG, WebP, GIF hoặc AVIF');
  if(kind==='image' && b.size>10*1024*1024)throw new StorageError('Ảnh tối đa 10 MB');
  const context=b.context??'hub';
  if(!['hub','event','project'].includes(String(context)))throw new StorageError('Nơi đính kèm không hợp lệ');
  if(context!=='hub' && (typeof b.parentId!=='string' || !uuidPattern.test(b.parentId)))throw new StorageError('Thiếu mã dự án/sự kiện hợp lệ');
  if(context==='hub' && b.parentId!=null)throw new StorageError('Kho chung không nhận mã dự án/sự kiện');
  return {name:b.fileName,size:b.size,mime,kind:kind as UploadSession['kind'],eventId:context==='event'?b.parentId as string:null,projectId:context==='project'?b.parentId as string:null};
}

export function chooseUploadProvider(kind:UploadSession['kind']):UploadSession['provider'] {
  if(kind==='image') {
    if(!process.env.IMAGEKIT_PRIVATE_KEY || !process.env.IMAGEKIT_PUBLIC_KEY || !process.env.IMAGEKIT_URL_ENDPOINT)throw new StorageError('Kho ảnh chưa được cấu hình',503);
    return 'imagekit';
  }
  const provider=process.env[kind==='video'?'STORAGE_VIDEO_PROVIDER':'STORAGE_DOCUMENT_PROVIDER'] || 'tigris';
  if(provider!=='tigris' && provider!=='b2')throw new StorageError('Kho tệp được cấu hình không hợp lệ',503);
  objectStore(provider).client.destroy();
  return provider;
}

export async function createUploadTicket(session:UploadSession) {
  const connection=await loadConnection(session);
  if(session.provider==='imagekit') {
    const config=imageConfig(connection);
    const index=session.storage_path.lastIndexOf('/');
    const fields={fileName:session.storage_path.slice(index+1),folder:session.storage_path.slice(0,index),
      isPrivateFile:'true',useUniqueFileName:'false',overwriteFile:'false',
      checks:`"file.size" <= ${session.size} AND "file.mime" IN ${JSON.stringify(imageTypes)}`};
    const now=Math.floor(Date.now()/1000);
    const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT',kid:config.publicKey})).toString('base64url');
    const payload=Buffer.from(JSON.stringify({...fields,iat:now,exp:now+300})).toString('base64url');
    const token=`${header}.${payload}.${crypto.createHmac('sha256',config.privateKey!).update(`${header}.${payload}`).digest('base64url')}`;
    return {ticketId:session.id,provider:session.provider,storagePath:session.storage_path,fields,token};
  }
  const store=objectStore(session.provider,await loadConnection(session));
  try {
    const immutable=session.provider!=='b2';
    const headers:Record<string,string>={'Content-Type':session.mime_type};
    if(immutable)headers['If-None-Match']='*';
    const uploadUrl=await getSignedUrl(store.client,new PutObjectCommand({Bucket:session.bucket,Key:session.storage_path,
      ContentType:session.mime_type,ContentLength:session.size,...(immutable?{IfNoneMatch:'*'}:{})}),{expiresIn:300,signableHeaders:new Set(['content-type','content-length',...(immutable?['if-none-match']:[])])});
    return {ticketId:session.id,provider:session.provider,storagePath:session.storage_path,bucket:session.bucket,uploadUrl,headers};
  } finally {store.client.destroy();}
}

export async function imageDetails(id:string,connection?:StorageConnection):Promise<{filePath:string;size:number;isPrivateFile:boolean;url:string;fileType?:string}> {
  if(!/^[a-zA-Z0-9_-]{10,100}$/.test(id))throw new StorageError('Mã ảnh không hợp lệ');
  const config=imageConfig(connection);
  const response=await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(id)}/details`,{
    headers:{Authorization:`Basic ${Buffer.from(config.privateKey+':').toString('base64')}`},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new StorageError('Không xác minh được ảnh trong kho',409);
  return response.json();
}

export async function verifyUploadedObject(session:UploadSession,objectId:unknown):Promise<{objectId:string;version:string|null}> {
  if(session.provider==='imagekit') {
    if(typeof objectId!=='string')throw new StorageError('Thiếu mã ảnh');
    const details=await imageDetails(objectId,await loadConnection(session));
    if(details.filePath!==session.storage_path || details.size!==session.size || details.isPrivateFile!==true || details.fileType!=='image')throw new StorageError('Ảnh không khớp phiếu upload',409);
    return {objectId,version:null};
  }
  if(objectId!=null && objectId!==session.storage_path)throw new StorageError('Đường dẫn không khớp phiếu upload');
  const store=objectStore(session.provider,await loadConnection(session));
  try {
    const details=await store.client.send(new HeadObjectCommand({Bucket:session.bucket,Key:session.storage_path}));
    if(details.ContentLength!==session.size || details.ContentType!==session.mime_type)throw new StorageError('Tệp không khớp kích thước/loại đã đăng ký',409);
    const version=session.provider==='b2'?details.VersionId:null;
    if(session.provider==='b2' && (!version || !/^[A-Za-z0-9_-]{10,200}$/.test(version)))throw new StorageError('B2 chưa trả phiên bản tệp hợp lệ',409);
    return {objectId:session.storage_path,version:version??null};
  } finally {store.client.destroy();}
}

export function databaseUploadError(error:{code?:string}|null):StorageError {
  if(error?.code==='42501')return new StorageError('Không có quyền đính kèm tại đây',403);
  if(error?.code==='22023')return new StorageError('Phiếu upload hết hạn hoặc không hợp lệ',409);
  if(error?.code==='P0001')return new StorageError('Đã chạm hạn mức upload, vui lòng thử lại sau',429);
  return new StorageError('Không lưu được phiếu upload',503);
}
