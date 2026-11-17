import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({from:vi.fn(),send:vi.fn(),destroy:vi.fn()}));
vi.mock('./supabase',()=>({supabaseAdmin:{from:mocks.from}}));
vi.mock('./storage',()=>({objectStore:()=>({bucket:'test',client:{send:mocks.send,destroy:mocks.destroy}})}));
vi.mock('@aws-sdk/client-s3',()=>({DeleteObjectCommand:class{input:unknown;constructor(input:unknown){this.input=input;}},ListObjectVersionsCommand:class{input:unknown;constructor(input:unknown){this.input=input;}}}));
import {cleanupExpiredUploads} from './storage-cleanup';
const fixture={id:'ticket',provider:'tigris',bucket:'test',storage_path:'test/owned'};
const query={select:vi.fn(),is:vi.fn(),or:vi.fn(),lt:vi.fn(),limit:vi.fn()};
const deletion={eq:vi.fn(),is:vi.fn(),lt:vi.fn()};
const remove=vi.fn();
beforeEach(()=>{vi.clearAllMocks();mocks.from.mockReturnValue({...query,delete:remove,update:()=>({eq:async()=>({error:null})})});query.select.mockReturnValue(query);query.is.mockReturnValue(query);query.or.mockReturnValue(query);query.lt.mockReturnValue(query);query.limit.mockResolvedValue({data:[fixture],error:null});remove.mockReturnValue(deletion);deletion.eq.mockReturnValue(deletion);deletion.is.mockReturnValue(deletion);deletion.lt.mockResolvedValue({error:null});mocks.send.mockResolvedValue({});});
afterEach(()=>vi.unstubAllGlobals());
it('only removes expired unfinished reservations after deleting the exact object',async()=>{
 expect(await cleanupExpiredUploads()).toEqual({removed:1,failed:0});
 expect(query.or).toHaveBeenCalledWith('completed_at.is.null,and(provider.eq.b2,versions_cleaned_at.is.null)');expect(query.lt).toHaveBeenCalledWith('expires_at',expect.any(String));
 expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({input:{Bucket:'test',Key:'test/owned'}}),{abortSignal:undefined});
 expect(deletion.eq).toHaveBeenCalledWith('id','ticket');expect(deletion.is).toHaveBeenCalledWith('completed_at',null);
});
it('retains quota reservation when provider deletion fails',async()=>{mocks.send.mockRejectedValue(Error('offline'));expect(await cleanupExpiredUploads()).toEqual({removed:0,failed:1});expect(remove).not.toHaveBeenCalled();});
it('rejects bucket changes rather than deleting from another bucket',async()=>{query.limit.mockResolvedValue({data:[{...fixture,bucket:'other'}],error:null});expect(await cleanupExpiredUploads()).toEqual({removed:0,failed:1});expect(mocks.send).not.toHaveBeenCalled();expect(remove).not.toHaveBeenCalled();});
it('only deletes matching ImageKit paths and keeps reservation on lookup errors',async()=>{
 query.limit.mockResolvedValue({data:[{...fixture,provider:'imagekit',storage_path:'/test/image.png'}],error:null});
 const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{fileId:'owned',filePath:'/test/image.png'},{fileId:'unrelated',filePath:'/other/image.png'}]),{status:200})).mockResolvedValueOnce(new Response(null,{status:204}));
 vi.stubGlobal('fetch',fetcher);expect(await cleanupExpiredUploads()).toEqual({removed:1,failed:0});expect(fetcher).toHaveBeenCalledTimes(2);expect(fetcher.mock.calls[1][0]).toBe('https://api.imagekit.io/v1/files/owned');
});
it('cleans replay versions while preserving the accepted B2 version',async()=>{
 query.limit.mockResolvedValue({data:[{...fixture,provider:'b2',completed_at:'2026-01-01',file_id:'file',storage_version:'accepted'}],error:null});
 mocks.send.mockResolvedValueOnce({Versions:[{Key:'test/owned',VersionId:'accepted'},{Key:'test/owned',VersionId:'replay'},{Key:'test/other',VersionId:'unrelated'}],IsTruncated:false}).mockResolvedValue({});
 expect(await cleanupExpiredUploads()).toEqual({removed:1,failed:0});
 expect(mocks.send).toHaveBeenCalledTimes(2);expect(mocks.send.mock.calls[1][0].input).toEqual({Bucket:'test',Key:'test/owned',VersionId:'replay'});expect(remove).not.toHaveBeenCalled();
});
