import {beforeEach,it,expect,vi} from 'vitest';
import type {VercelRequest,VercelResponse} from '@vercel/node';
const m=vi.hoisted(()=>({verifyUser:vi.fn(),single:vi.fn(),rpc:vi.fn(),upsert:vi.fn()}));
vi.mock('./_lib/supabase',()=>({verifyUser:m.verifyUser,setCors:()=>true,supabaseAdmin:{rpc:m.rpc,from:()=>({select:()=>({eq:()=>({single:m.single})}),upsert:m.upsert})}}));
import handler from './storage-control';
async function call(body:unknown){const res={setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn(),end:vi.fn()};await handler({method:'POST',headers:{authorization:'Bearer unit'},body} as VercelRequest,res as unknown as VercelResponse);return res;}
beforeEach(()=>{vi.clearAllMocks();m.verifyUser.mockResolvedValue({id:'actor'});m.single.mockResolvedValue({data:{approval_status:'active'}});m.rpc.mockResolvedValue({data:false,error:null});});
it.each(['save-limit','save-connection','scan','run-due'])('member cannot %s',async action=>{expect((await call({action})).status).toHaveBeenCalledWith(403);expect(m.upsert).not.toHaveBeenCalled();});
it('pending user cannot scan or enumerate storage',async()=>{m.single.mockResolvedValue({data:{approval_status:'pending'}});expect((await call({action:'overview'})).status).toHaveBeenCalledWith(403);expect(m.rpc).not.toHaveBeenCalled();});
it('uses session actor for hold instead of body actor',async()=>{m.rpc.mockResolvedValue({data:{state:'retained'},error:null});await call({action:'hold',id:'11111111-1111-4111-8111-111111111111',actor:'forged',reason:'needed'});expect(m.rpc).toHaveBeenCalledWith('storage_retention_action',expect.objectContaining({p_actor:'actor',p_action:'hold'}));});
it('propagates database authorization rejection on approval',async()=>{m.rpc.mockResolvedValue({error:{code:'42501'}});expect((await call({action:'approve',id:'11111111-1111-4111-8111-111111111111'})).status).toHaveBeenCalledWith(403);});
