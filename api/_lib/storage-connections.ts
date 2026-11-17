import {supabaseAdmin} from './supabase';
import {StorageError} from './storage';

export interface StorageConnection {
 endpoint_url?:string;id:string;label:string;provider:'imagekit'|'tigris'|'b2';env_prefix:string;bucket:string;write_enabled:boolean;
 image_priority:number|null;document_priority:number|null;video_priority:number|null;
 capacity_bytes:number;warn_percent:number;stop_percent:number;reported_used_bytes:number;
}
export function connectionConfig(c:StorageConnection) {
 if(!/^(B2|TIGRIS_STORAGE|IMAGEKIT|STORAGE_CONN_[A-Z0-9_]+)$/.test(c.env_prefix))throw new StorageError('Mã cấu hình kho không hợp lệ',503);
 const get=(suffix:string)=>process.env[c.env_prefix+'_'+suffix];
 const configuredEndpoint=get(c.provider==='imagekit'?'URL_ENDPOINT':'ENDPOINT');
 if(c.endpoint_url && configuredEndpoint?.replace(/\/+$/,'')!==c.endpoint_url)throw new StorageError('Endpoint khác kết nối gốc; cần tạo kho mới',409);
 if(c.provider==='imagekit') {
  const privateKey=get('PRIVATE_KEY'),publicKey=get('PUBLIC_KEY'),endpoint=get('URL_ENDPOINT');
  if(!privateKey || !publicKey || !endpoint || !/^https:\/\//.test(endpoint))throw new StorageError('Kho ảnh thiếu cấu hình server',503);
  return {privateKey,publicKey,endpoint,bucket:c.bucket};
 }
 const endpoint=get('ENDPOINT'),key=get('ACCESS_KEY_ID')??get('KEY_ID'),secret=get('SECRET_ACCESS_KEY')??get('APPLICATION_KEY');
 if(!endpoint || !key || !secret || !/^https:\/\//.test(endpoint))throw new StorageError('Kho thiếu cấu hình server',503);
 return {endpoint,key,secret,bucket:c.bucket,region:get('REGION')??(c.provider==='b2'?'us-east-1':'auto')};
}
export async function loadConnection(row:{storage_connection_id?:string|null;provider?:string;storage_provider?:string|null;bucket?:string;storage_bucket?:string|null}):Promise<StorageConnection|undefined> {
 if(!row.storage_connection_id)return undefined;
 const {data,error}=await supabaseAdmin.from('storage_connections').select('*').eq('id',row.storage_connection_id).single();
 if(error || !data)throw new StorageError('Không tìm thấy kết nối gốc của tệp',503);
 const c=data as StorageConnection;
 if(c.provider!==(row.provider??row.storage_provider) || (row.bucket??row.storage_bucket) && c.bucket!==(row.bucket??row.storage_bucket))throw new StorageError('Kết nối gốc không khớp tệp',409);
 connectionConfig(c);
 return c;
}
export async function uploadCandidates(kind:'image'|'document'|'video'):Promise<string[]> {
 const {data,error}=await supabaseAdmin.from('storage_connections').select('*').eq('write_enabled',true).not(kind+'_priority','is',null);
 if(error)throw new StorageError('Không tải được danh sách kho',503);
 const ids:string[]=[];
 for(const c of (data??[]) as StorageConnection[]) {try {connectionConfig(c);ids.push(c.id);}catch{}}
 if(!ids.length)throw new StorageError('Chưa có kho phù hợp được cấu hình',503);
 return ids;
}
export function imageConfig(c?:StorageConnection) {
 if(c){if(c.provider!=='imagekit')throw new StorageError('Sai loại kho',409);return connectionConfig(c);}
 const privateKey=process.env.IMAGEKIT_PRIVATE_KEY,publicKey=process.env.IMAGEKIT_PUBLIC_KEY,endpoint=process.env.IMAGEKIT_URL_ENDPOINT;
 if(!privateKey || !publicKey || !endpoint)throw new StorageError('Kho ảnh chưa được cấu hình',503);
 return {privateKey,publicKey,endpoint,bucket:'imagekit'};
}
