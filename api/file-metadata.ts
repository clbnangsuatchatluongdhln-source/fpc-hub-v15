import type {VercelRequest,VercelResponse} from '@vercel/node';
import {setCors,supabaseAdmin} from './_lib/supabase';
import {StorageError} from './_lib/storage';
import {activeUploader,uuidPattern,verifyUploadedObject,databaseUploadError,type UploadSession} from './_lib/upload-session';

export default async function handler(req:VercelRequest,res:VercelResponse) {
  if(!setCors(res,req.headers.origin))return res.status(403).json({error:'Origin không được phép'});
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try {
    const owner=await activeUploader(req.headers.authorization);
    const body=req.body??{};
    if(typeof body.ticketId!=='string' || !uuidPattern.test(body.ticketId))throw new StorageError('Cần phiếu upload hợp lệ');
    if(Object.keys(body).some(key=>!['ticketId','objectId'].includes(key)))throw new StorageError('Không được tự đặt thông tin tệp hoặc nơi đính kèm');
    const {data,error}=await supabaseAdmin.from('storage_uploads').select('*').eq('id',body.ticketId).eq('owner_id',owner).maybeSingle();
    if(error || !data)throw new StorageError('Không tìm thấy phiếu upload của bạn',403);
    const session=data as UploadSession;
    if(!session.completed_at && Date.parse(session.expires_at)<=Date.now())throw new StorageError('Phiếu upload đã hết hạn',409);
    const verified=session.completed_at?{objectId:session.provider==='imagekit'?String(body.objectId??''):session.storage_path,version:session.storage_version??null}:await verifyUploadedObject(session,body.objectId);
    const finalized=await supabaseAdmin.rpc('storage_finalize_upload',{p_id:session.id,p_owner:owner,p_object_id:verified.objectId,p_version:verified.version});
    if(finalized.error || !finalized.data)throw databaseUploadError(finalized.error);
    const row=finalized.data;
    return res.json({...row,originalSize:row.original_size,uploadedBy:'Bạn',at:new Date(row.created_at).getTime()});
  } catch(error) {
    if(error instanceof StorageError)return res.status(error.status).json({error:error.message});
    return res.status(503).json({error:'Chưa xác minh được upload; thông tin tệp chưa được tạo'});
  }
}
