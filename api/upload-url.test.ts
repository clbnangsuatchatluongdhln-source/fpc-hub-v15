import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import type {VercelRequest,VercelResponse} from '@vercel/node';
const mocks=vi.hoisted(()=>({verifyUser:vi.fn(),single:vi.fn(),rpc:vi.fn(),from:vi.fn(),sign:vi.fn(),send:vi.fn()}));
vi.mock('./_lib/supabase',()=>({verifyUser:mocks.verifyUser,setCors:()=>true,supabaseAdmin:{from:mocks.from,rpc:mocks.rpc}}));
vi.mock('@aws-sdk/client-s3',()=>({S3Client:class{send=mocks.send;destroy(){}},PutObjectCommand:class{input:unknown;constructor(input:unknown){this.input=input;}},HeadObjectCommand:class{input:unknown;constructor(input:unknown){this.input=input;}}}));
vi.mock('@aws-sdk/s3-request-presigner',()=>({getSignedUrl:mocks.sign}));
import handler from './upload-url';
import metadata from './file-metadata';
import {uploadInput,createUploadTicket,verifyUploadedObject,type UploadSession} from './_lib/upload-session';
const owner='11111111-1111-4111-8111-111111111111';
const ticket='22222222-2222-4222-8222-222222222222';
const session:UploadSession={id:ticket,owner_id:owner,provider:'tigris',bucket:'test',storage_path:'safe/object',name:'a.pdf',mime_type:'application/pdf',kind:'document',size:3,event_id:null,project_id:null,expires_at:new Date(Date.now()+600000).toISOString(),completed_at:null,file_id:null};
const chain={not:vi.fn(),select:vi.fn(),eq:vi.fn(),single:mocks.single,maybeSingle:vi.fn()};
async function request(body:unknown,endpoint=handler,method='POST'){
 const res={status:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis(),end:vi.fn()};
 await endpoint({method,headers:{authorization:'Bearer unit-placeholder'},body} as VercelRequest,res as unknown as VercelResponse);return res;
}
beforeEach(()=>{
 chain.not.mockResolvedValue({data:[{id:'candidate',provider:'tigris',env_prefix:'TIGRIS_STORAGE',bucket:'test'}],error:null});
 vi.clearAllMocks();mocks.verifyUser.mockResolvedValue({id:owner});mocks.single.mockResolvedValue({data:{approval_status:'active'},error:null});
 mocks.from.mockReturnValue(chain);chain.select.mockReturnValue(chain);chain.eq.mockReturnValue(chain);chain.maybeSingle.mockResolvedValue({data:session,error:null});
 mocks.rpc.mockImplementation(async(name,args)=>name==='storage_issue_upload'?{data:{...session,...args.p_upload},error:null}:{data:{id:ticket,name:'a.pdf',created_at:new Date().toISOString()},error:null});
 mocks.sign.mockResolvedValue('https://example.invalid/upload');mocks.send.mockResolvedValue({ContentLength:3,ContentType:'application/pdf'});
 for(const[k,v]of Object.entries({TIGRIS_STORAGE_ENDPOINT:'https://test.invalid',TIGRIS_STORAGE_ACCESS_KEY_ID:'placeholder',TIGRIS_STORAGE_SECRET_ACCESS_KEY:'placeholder',TIGRIS_STORAGE_BUCKET:'test',IMAGEKIT_PRIVATE_KEY:'unit-placeholder',IMAGEKIT_PUBLIC_KEY:'unit-public',IMAGEKIT_URL_ENDPOINT:'https://ik.imagekit.io/test',STORAGE_DOCUMENT_PROVIDER:'tigris',STORAGE_VIDEO_PROVIDER:'tigris'}))vi.stubEnv(k,v);
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
const input={fileName:'a.pdf',fileType:'application/pdf',size:3,context:'hub'};
describe('upload authorization',()=>{
 it.each(['pending','rejected','disabled','',null,'ACTIVE'])('denies approval %s before issuing a ticket',async status=>{mocks.single.mockResolvedValue({data:{approval_status:status},error:null});const r=await request(input);expect(r.status).toHaveBeenCalledWith(403);expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.sign).not.toHaveBeenCalled();});
 it('rejects anonymous access',async()=>{mocks.verifyUser.mockResolvedValue(null);expect((await request(input)).status).toHaveBeenCalledWith(401);expect(mocks.from).not.toHaveBeenCalled();});
 it('fails closed on profile transport errors',async()=>{mocks.single.mockRejectedValue(Error('offline'));expect((await request(input)).status).toHaveBeenCalledWith(503);expect(mocks.rpc).not.toHaveBeenCalled();});
 it('binds owner, parent and object path on the server',async()=>{const r=await request({...input,context:'project',parentId:ticket});expect(r.json).toHaveBeenCalledWith(expect.objectContaining({provider:'tigris',ticketId:expect.any(String)}));expect(mocks.rpc).toHaveBeenCalledWith('storage_issue_upload',{p_upload:expect.objectContaining({owner_id:owner,project_id:ticket,candidate_ids:['candidate']})});});
 it('denies unauthorized parents before signing',async()=>{mocks.rpc.mockResolvedValue({error:{code:'42501'},data:null});expect((await request({...input,context:'event',parentId:ticket})).status).toHaveBeenCalledWith(403);expect(mocks.sign).not.toHaveBeenCalled();});
 it.each(['provider','storagePath','uploaded_by','publicUrl'])('rejects caller-selected %s',key=>expect(()=>uploadInput({...input,[key]:'forged'})).toThrow());
 it.each([0,-1,1.5,104857601,NaN])('rejects unsafe size %s',size=>expect(()=>uploadInput({...input,size})).toThrow());
 it.each(['../a.pdf','a/b.pdf','a\\b.pdf','a\u0000.pdf'])('rejects unsafe name %s',fileName=>expect(()=>uploadInput({...input,fileName})).toThrow());
 it('rejects unsupported images and invalid parent context',()=>{expect(()=>uploadInput({...input,fileType:'image/svg+xml'})).toThrow();expect(()=>uploadInput({...input,context:'event'})).toThrow();expect(()=>uploadInput({...input,parentId:ticket})).toThrow();});
 it('binds ImageKit private status and path in signed JWT',async()=>{const t=await createUploadTicket({...session,provider:'imagekit',storage_path:'/fpc-hub/x.png',mime_type:'image/png',kind:'image'});const payload=JSON.parse(Buffer.from(t.token!.split('.')[1],'base64url').toString());expect(payload.isPrivateFile).toBe('true');expect(payload.folder).toBe('/fpc-hub');expect(payload.fileName).toBe('x.png');expect(payload.exp-payload.iat).toBe(300);});
 it('signs immutable S3 upload with exact size',async()=>{await createUploadTicket(session);expect(mocks.sign).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({input:expect.objectContaining({ContentLength:3,IfNoneMatch:'*',Key:session.storage_path})}),expect.anything());});
 it.each([['OPTIONS',204],['GET',405]])('keeps %s handling',async(method,status)=>{expect((await request(input,handler,method as string)).status).toHaveBeenCalledWith(status);expect(mocks.verifyUser).not.toHaveBeenCalled();});
});
describe('metadata provenance',()=>{
 it('rejects old arbitrary metadata payloads',async()=>{expect((await request({name:'forged',storagePath:'victim',kind:'image',folderId:ticket,context:'project'},metadata)).status).toHaveBeenCalledWith(400);expect(mocks.rpc).not.toHaveBeenCalled();});
 it.each(['storagePath','provider','folderId','uploaded_by','publicUrl','size'])('rejects tampered %s even alongside a ticket',async key=>{expect((await request({ticketId:ticket,[key]:'forged'},metadata)).status).toHaveBeenCalledWith(400);expect(mocks.rpc).not.toHaveBeenCalled();});
 it('rejects another user ticket',async()=>{chain.maybeSingle.mockResolvedValue({data:null,error:null});expect((await request({ticketId:ticket},metadata)).status).toHaveBeenCalledWith(403);expect(chain.eq).toHaveBeenCalledWith('owner_id',owner);expect(mocks.rpc).not.toHaveBeenCalled();});
 it('rejects expired tickets',async()=>{chain.maybeSingle.mockResolvedValue({data:{...session,expires_at:'2000-01-01'},error:null});expect((await request({ticketId:ticket},metadata)).status).toHaveBeenCalledWith(409);expect(mocks.rpc).not.toHaveBeenCalled();});
 it('rejects object path and actual size mismatch',async()=>{await expect(verifyUploadedObject(session,'other')).rejects.toThrow();mocks.send.mockResolvedValue({ContentLength:4});expect((await request({ticketId:ticket},metadata)).status).toHaveBeenCalledWith(409);expect(mocks.rpc).not.toHaveBeenCalled();});
 it('requires and preserves verified B2 version identity',async()=>{vi.stubEnv('B2_ENDPOINT','https://test.invalid');vi.stubEnv('B2_KEY_ID','placeholder');vi.stubEnv('B2_APPLICATION_KEY','placeholder');vi.stubEnv('B2_BUCKET','test');const b2={...session,provider:'b2' as const};await expect(verifyUploadedObject(b2,b2.storage_path)).rejects.toThrow();mocks.send.mockResolvedValue({ContentLength:3,ContentType:'application/pdf',VersionId:'version_1234567890'});expect(await verifyUploadedObject(b2,b2.storage_path)).toEqual({objectId:b2.storage_path,version:'version_1234567890'});});
 it('does not finalize on provider outage',async()=>{mocks.send.mockRejectedValue(Error('unavailable'));expect((await request({ticketId:ticket},metadata)).status).toHaveBeenCalledWith(503);expect(mocks.rpc).not.toHaveBeenCalled();});
 it.each([{filePath:'/other/image.png',size:3,isPrivateFile:true,fileType:'image'},{filePath:'/safe/image.png',size:3,isPrivateFile:false,fileType:'image'}])('rejects an unbound or public ImageKit object',async details=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(details),{status:200})));await expect(verifyUploadedObject({...session,provider:'imagekit',storage_path:'/safe/image.png'},'imagefixtureid123')).rejects.toThrow();});
 it('finalizes verified object with identity and stored ticket only',async()=>{const r=await request({ticketId:ticket},metadata);expect(r.json).toHaveBeenCalledWith(expect.objectContaining({id:ticket}));expect(mocks.rpc).toHaveBeenCalledWith('storage_finalize_upload',{p_id:ticket,p_owner:owner,p_object_id:session.storage_path,p_version:null});});
 it('propagates parent revocation at finalization',async()=>{mocks.rpc.mockResolvedValue({data:null,error:{code:'42501'}});expect((await request({ticketId:ticket},metadata)).status).toHaveBeenCalledWith(403);});
});
