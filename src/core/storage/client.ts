import { supabase } from '../supabase';
import { storageRequest } from './http';
import { classifyFile, type StoredObject, type UploadResult, type StorageProvider } from './types';

interface UploadTicket {
  ticketId:string;
  provider:StorageProvider;
  storagePath:string;
  bucket?:string;
  uploadUrl?:string;
  headers?:Record<string,string>;
  token?:string;
  fields?:Record<string,string|number|boolean>;
}

export async function uploadObject(file:File,
  options:{target:'hub'|'legacy';folder?:string;context?:'hub'|'event'|'project';parentId?:string;signal?:AbortSignal}):Promise<UploadResult> {
  if(!file.size || file.size>100*1024*1024)throw new Error('Chọn tệp từ 1 byte đến 100 MB');
  options.signal?.throwIfAborted();
  const kind=classifyFile(file);
  const ticket=await storageRequest<UploadTicket>('/api/upload-url',{fileName:file.name,size:file.size,
    fileType:file.type || 'application/octet-stream',context:options.context??'hub',parentId:options.parentId},options.signal);
  if(!ticket.ticketId)throw new Error('Thiếu mã phiếu upload');
  options.signal?.throwIfAborted();
  if(ticket.provider==='imagekit') {
    if(!ticket.token || !ticket.fields)throw new Error('Phiếu upload ảnh không đầy đủ');
    const form=new FormData();
    form.append('file',file);
    form.append('token',ticket.token);
    for(const [key,value] of Object.entries(ticket.fields))form.append(key,String(value));
    const response=await fetch('https://upload.imagekit.io/api/v2/files/upload',{method:'POST',body:form,signal:options.signal});
    if(!response.ok)throw new Error(`Upload ảnh thất bại (${response.status})`);
    const result=await response.json() as {fileId:string};
    if(!result.fileId)throw new Error('Kho ảnh không trả mã tệp');
    return {ticketId:ticket.ticketId,provider:'imagekit',storagePath:result.fileId,objectId:result.fileId,url:'',kind,fileType:kind};
  }
  if(!['b2','tigris'].includes(ticket.provider) || !ticket.uploadUrl || !ticket.storagePath)throw new Error('Phiếu upload không hợp lệ');
  const response=await fetch(ticket.uploadUrl,{method:'PUT',body:file,signal:options.signal,headers:ticket.headers});
  if(!response.ok)throw new Error(`Upload thất bại (${response.status})`);
  return {ticketId:ticket.ticketId,provider:ticket.provider,bucket:ticket.bucket,storagePath:ticket.storagePath,
    objectId:ticket.storagePath,url:'',kind,fileType:kind};
}

export async function finalizeObject<T>(upload:UploadResult):Promise<T> {
  return storageRequest<T>('/api/file-metadata',{ticketId:upload.ticketId,objectId:upload.objectId});
}

export async function getObjectUrl(reference:StoredObject,expiresIn=300):Promise<string> {
  if(!reference.storagePath)throw new Error('Tệp chưa có địa chỉ');
  if(reference.provider==='supabase' && (!reference.id || reference.bucket==='files')) {
    const {data,error}=await supabase.storage.from(reference.bucket || 'files').createSignedUrl(reference.storagePath,Math.min(3600,Math.max(30,expiresIn)));
    if(error)throw error;
    return data.signedUrl;
  }
  const result=await storageRequest<{url:string}>('/api/download-url',{fileId:reference.id,storagePath:reference.storagePath});
  return result.url;
}

export async function removeObject(reference:StoredObject):Promise<void> {
  if(reference.provider==='supabase' && (!reference.id || reference.bucket==='files')) {
    const {error}=await supabase.storage.from(reference.bucket || 'files').remove([reference.storagePath]);
    if(error)throw error;
    return;
  }
  const result=await storageRequest<{success:boolean}>('/api/file-delete',{mode:'storage',fileId:reference.id,storagePath:reference.storagePath});
  if(!result.success)throw new Error('Kho chưa xác nhận xóa tệp; giữ nguyên thông tin tệp');
}
