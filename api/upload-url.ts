import {uploadCandidates} from './_lib/storage-connections';
import type { VercelRequest,VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';
import { setCors,supabaseAdmin } from './_lib/supabase';
import { StorageError } from './_lib/storage';
import { activeUploader,uploadInput,createUploadTicket,databaseUploadError,type UploadSession } from './_lib/upload-session';

export default async function handler(req:VercelRequest,res:VercelResponse) {
  if(!setCors(res,req.headers.origin))return res.status(403).json({error:'Origin không được phép'});
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try {
    const owner=await activeUploader(req.headers.authorization);
    const input=uploadInput(req.body);
    const candidate_ids=await uploadCandidates(input.kind);
    const {data,error}=await supabaseAdmin.rpc('storage_issue_upload',{p_upload:{id:crypto.randomUUID(),owner_id:owner,candidate_ids,
      name:input.name,size:input.size,mime_type:input.mime,kind:input.kind,event_id:input.eventId,project_id:input.projectId}});
    if(error || !data){if(error?.code==='P0001')await supabaseAdmin.rpc('storage_refresh_governance',{p_retention:false});throw databaseUploadError(error);}
    return res.json(await createUploadTicket(data as UploadSession));
  } catch(error) {
    if(error instanceof StorageError)return res.status(error.status).json({error:error.message});
    return res.status(503).json({error:'Không cấp được phiếu upload; kiểm tra cấu hình server'});
  }
}
