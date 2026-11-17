import {runStorageMaintenance} from './_lib/storage-maintenance';
import type {VercelRequest,VercelResponse} from '@vercel/node';
import {setCors,supabaseAdmin} from './_lib/supabase';
import {StorageError} from './_lib/storage';
import {activeUploader,uuidPattern,databaseUploadError} from './_lib/upload-session';
import {connectionConfig,type StorageConnection} from './_lib/storage-connections';

function number(value:unknown,min:number,max:number) {
 if(typeof value!=='number' || !Number.isSafeInteger(value) || value<min || value>max)throw new StorageError('Hạn mức không hợp lệ');return value;
}
export default async function handler(req:VercelRequest,res:VercelResponse) {
 if(!setCors(res,req.headers.origin))return res.status(403).json({error:'Origin không được phép'});
 res.setHeader('Cache-Control','no-store');
 if(req.method==='OPTIONS')return res.status(204).end();
 if(req.method!=='POST')return res.status(405).end();
 try {
  const actor=await activeUploader(req.headers.authorization);
  const b=req.body as Record<string,unknown>;
  if(!b || typeof b!=='object' || Array.isArray(b))throw new StorageError('Dữ liệu không hợp lệ');
  if(b.action==='overview') {
   const result=await supabaseAdmin.rpc('storage_overview',{p_actor:actor});if(result.error)throw databaseUploadError(result.error);
   const data=result.data;
   data.connections=(data.connections??[]).map((c:StorageConnection)=>{let configured=true;try{connectionConfig(c);}catch{configured=false;}return {...c,configured};});
   return res.json(data);
  }
  if(b.action==='hold' || b.action==='approve') {
   if(typeof b.id!=='string' || !uuidPattern.test(b.id))throw new StorageError('Mã yêu cầu không hợp lệ');
   const result=await supabaseAdmin.rpc('storage_retention_action',{p_actor:actor,p_job:b.id,p_action:b.action,p_audience:b.audience??'related',p_reason:typeof b.reason==='string'?b.reason.slice(0,500):''});
   if(result.error)throw databaseUploadError(result.error);return res.json({success:true});
  }
  const admin=await supabaseAdmin.rpc('storage_is_admin',{p_user:actor});
  if(admin.error || admin.data!==true)throw new StorageError('Chỉ quản trị được thay đổi cấu hình kho',403);
  if(b.action==='run-due')return res.json(await runStorageMaintenance());
  if(b.action==='scan') {
   const result=await supabaseAdmin.rpc('storage_refresh_governance',{p_retention:true});if(result.error)throw databaseUploadError(result.error);return res.json({success:true});
  }
  if(b.action==='save-limit') {
   if(typeof b.user_id!=='string' || !uuidPattern.test(b.user_id) || typeof b.enabled!=='boolean')throw new StorageError('Tài khoản không hợp lệ');
   const result=await supabaseAdmin.from('storage_user_limits').upsert({user_id:b.user_id,enabled:b.enabled,max_file_bytes:number(b.max_file_bytes,1,104857600),daily_bytes:number(b.daily_bytes,0,1099511627776),daily_count:number(b.daily_count,0,10000),total_bytes:number(b.total_bytes,0,1099511627776),updated_at:new Date().toISOString()});
   if(result.error)throw new StorageError('Chưa lưu được hạn mức',503);return res.json({success:true});
  }
  if(b.action==='save-connection') {
   if(typeof b.id!=='string' || !uuidPattern.test(b.id) || typeof b.write_enabled!=='boolean')throw new StorageError('Mã kho không hợp lệ');
   const warn=number(b.warn_percent,1,98),stop=number(b.stop_percent,2,99);if(warn>=stop)throw new StorageError('Ngưỡng cảnh báo phải nhỏ hơn ngưỡng dừng');
   const priorities:Record<string,number|null>={};for(const kind of ['image','document','video'])priorities[kind+'_priority']=b[kind+'_priority']==null?null:number(b[kind+'_priority'],1,1000);
   const original=await supabaseAdmin.from('storage_connections').select('provider').eq('id',b.id).single();
   if(original.error || !original.data)throw new StorageError('Không tìm thấy kho',404);
   if(original.data.provider==='imagekit' && (priorities.document_priority!==null || priorities.video_priority!==null))throw new StorageError('Kho ảnh chỉ nhận ảnh raster');
   const result=await supabaseAdmin.from('storage_connections').update({label:String(b.label??'').slice(0,100),write_enabled:b.write_enabled,capacity_bytes:number(b.capacity_bytes,1,1099511627776),reported_used_bytes:number(b.reported_used_bytes,0,1099511627776),reported_at:new Date().toISOString(),warn_percent:warn,stop_percent:stop,...priorities}).eq('id',b.id);
   if(result.error)throw new StorageError('Chưa lưu được cấu hình kho',503);return res.json({success:true});
  }
  throw new StorageError('Thao tác không hợp lệ');
 } catch(error) {
  if(error instanceof StorageError)return res.status(error.status).json({error:error.message});
  return res.status(503).json({error:'Quản trị kho tạm thời không khả dụng'});
 }
}
