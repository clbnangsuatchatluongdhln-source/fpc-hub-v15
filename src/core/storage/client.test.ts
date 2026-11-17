import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({upload:vi.fn(),remove:vi.fn(),sign:vi.fn(),from:vi.fn(),getUser:vi.fn(),getSession:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{auth:{getUser:mocks.getUser,getSession:mocks.getSession},storage:{from:mocks.from}}}));
import {uploadObject,getObjectUrl,removeObject} from './client';

describe('storage gateway',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.from.mockReturnValue({upload:mocks.upload,remove:mocks.remove,createSignedUrl:mocks.sign});
  mocks.getUser.mockResolvedValue({data:{user:{id:'owner'}},error:null});
  mocks.getSession.mockResolvedValue({data:{session:{access_token:'unit-test-placeholder'}}});
  mocks.upload.mockResolvedValue({error:null});mocks.remove.mockResolvedValue({error:null});
  mocks.sign.mockResolvedValue({data:{signedUrl:'https://example.invalid/signed'},error:null});
 });
 afterEach(()=>vi.unstubAllGlobals());
 it('uploads hub files only using the server-issued provider and path',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ticketId:'ticket',provider:'tigris',storagePath:'owner/object',bucket:'private',uploadUrl:'https://example.invalid/put',headers:{'Content-Type':'application/pdf'}}),{status:200}))
   .mockResolvedValueOnce(new Response('',{status:200}));
  vi.stubGlobal('fetch',fetcher);
  const result=await uploadObject(new File(['abc'],'a.pdf',{type:'application/pdf'}),{target:'hub'});
  expect(result.provider).toBe('tigris');expect(result.bucket).toBe('private');
  expect(result.storagePath).toBe('owner/object');expect(result.ticketId).toBe('ticket');expect(mocks.upload).not.toHaveBeenCalled();
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(expect.objectContaining({size:3,context:'hub'}));
 });
 it('never uploads when authentication fails or the file is empty',async()=>{
  mocks.getSession.mockResolvedValue({data:{session:null}});
  await expect(uploadObject(new File(['x'],'a.pdf'),{target:'hub'})).rejects.toThrow();
  await expect(uploadObject(new File([],'empty'),{target:'hub'})).rejects.toThrow();
  expect(mocks.upload).not.toHaveBeenCalled();
 });
 it('propagates storage deletion failures so callers keep metadata',async()=>{
  mocks.remove.mockResolvedValue({error:new Error('unavailable')});
  await expect(removeObject({provider:'supabase',bucket:'files',storagePath:'old/key',kind:'document'})).rejects.toThrow('unavailable');
 });
 it('asks the server to resolve an external file by its id',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({url:'https://example.invalid/object'}),{status:200}));
  vi.stubGlobal('fetch',fetcher);
  await getObjectUrl({id:'file-1',provider:'b2',storagePath:'object.pdf',kind:'document'});
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({fileId:'file-1',storagePath:'object.pdf'});
  expect(mocks.sign).not.toHaveBeenCalled();
 });
 it('does not delete metadata or report success when external deletion is rejected',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({success:false}),{status:200})));
  await expect(removeObject({id:'f',provider:'imagekit',storagePath:'image-id',kind:'image'})).rejects.toThrow();
 });
 it('uses server metadata for legacy video buckets rather than guessing account configuration',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({url:'https://example.invalid/video'}),{status:200}));
  vi.stubGlobal('fetch',fetcher);
  await getObjectUrl({id:'v',provider:'supabase',bucket:'fpc-files',storagePath:'video',kind:'video'});
  expect(fetcher).toHaveBeenCalled();expect(mocks.sign).not.toHaveBeenCalled();
 });
 it('uses signed URLs for existing hub files without moving them',async()=>{
  await getObjectUrl({id:'old',provider:'supabase',bucket:'files',storagePath:'old.pdf',kind:'document'});
  expect(mocks.sign).toHaveBeenCalledWith('old.pdf',300);expect(mocks.upload).not.toHaveBeenCalled();
 });
});
