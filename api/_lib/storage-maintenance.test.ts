import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),remove:vi.fn(),cleanup:vi.fn(),mutations:[] as {table:string;op:string}[]}));
vi.mock('./supabase',()=>({supabaseAdmin:{rpc:m.rpc,from:m.from}}));
vi.mock('./storage-cleanup',()=>({cleanupExpiredUploads:m.cleanup}));
vi.mock('./storage-delete',()=>({deleteStoredObject:m.remove}));
import {runStorageMaintenance} from './storage-maintenance';
beforeEach(()=>{vi.clearAllMocks();m.mutations.length=0;m.cleanup.mockResolvedValue({removed:0,failed:0});m.remove.mockResolvedValue(undefined);
 m.rpc.mockImplementation(async(name:string)=>name==='storage_retention_claim'?{data:{state:'deleting'},error:null}:{data:{ok:true},error:null});
 m.from.mockImplementation((table:string)=>{let op='select',count=false;const chain={select:(_fields:string,options?:{count?:string})=>{count=!!options?.count;return chain;},update:()=>{op='update';return chain;},delete:()=>{op='delete';return chain;},eq:()=>chain,lt:()=>chain,lte:()=>chain,in:()=>chain,or:()=>chain,order:()=>chain,limit:()=>chain,then:(resolve:(result:unknown)=>void)=>{if(op!=='select')m.mutations.push({table,op});return Promise.resolve(op!=='select'?{error:null}:count?{count:0,error:null}:{data:table==='storage_retention_jobs'?[{id:'job',event_id:'event'}]:table==='files'?[{id:'file',event_id:'event',storage_path:'object'}]:[],error:null}).then(resolve);}};return chain;});
});
it('provider failure keeps metadata and event and records retry state',async()=>{m.remove.mockRejectedValue(new Error('provider outage'));const result=await runStorageMaintenance();expect(result.failed).toBe(1);expect(result.deleted).toBe(0);expect(m.mutations.filter(x=>x.table==='files')).toEqual([]);expect(m.rpc).not.toHaveBeenCalledWith('storage_retention_finish',expect.anything());});
it('removes physical object before metadata and finalizes approved job',async()=>{const result=await runStorageMaintenance();expect(result.deleted).toBe(1);expect(m.remove).toHaveBeenCalledWith(expect.objectContaining({id:'file'}),undefined);expect(m.mutations).toContainEqual({table:'files',op:'delete'});expect(m.rpc).toHaveBeenCalledWith('storage_retention_finish',{p_job:'job'});});
it('never deletes objects if database refuses the claim',async()=>{m.rpc.mockImplementation(async(name:string)=>name==='storage_retention_claim'?{error:{code:'42501'}}:{data:{ok:true}});await runStorageMaintenance();expect(m.remove).not.toHaveBeenCalled();expect(m.mutations.filter(x=>x.table==='files')).toEqual([]);});

it('does not claim retention jobs after the runtime budget expires',async()=>{const signal=AbortSignal.abort();const result=await runStorageMaintenance({signal});expect(result).toMatchObject({deferred:true,deleted:0});expect(m.rpc).not.toHaveBeenCalled();expect(m.remove).not.toHaveBeenCalled();});
