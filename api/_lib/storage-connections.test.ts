import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({from:vi.fn(),single:vi.fn(),not:vi.fn()}));
vi.mock('./supabase',()=>({supabaseAdmin:{from:mocks.from}}));
import {connectionConfig,loadConnection,uploadCandidates,type StorageConnection} from './storage-connections';
const c={id:'second',provider:'tigris',env_prefix:'STORAGE_CONN_SECOND',bucket:'second-bucket',write_enabled:false} as StorageConnection;
beforeEach(()=>{vi.clearAllMocks();const chain={select:()=>chain,eq:()=>chain,single:mocks.single,not:mocks.not};mocks.from.mockReturnValue(chain);mocks.single.mockResolvedValue({data:c,error:null});for(const[k,v]of Object.entries({STORAGE_CONN_SECOND_ENDPOINT:'https://second.invalid',STORAGE_CONN_SECOND_ACCESS_KEY_ID:'second-key',STORAGE_CONN_SECOND_SECRET_ACCESS_KEY:'second-secret',TIGRIS_STORAGE_ACCESS_KEY_ID:'old-key'}))vi.stubEnv(k,v);});
afterEach(()=>vi.unstubAllEnvs());
it('reads original account even when writes are disabled',async()=>{const loaded=await loadConnection({storage_connection_id:c.id,provider:'tigris',bucket:c.bucket});expect(connectionConfig(loaded!)).toMatchObject({key:'second-key',secret:'second-secret',bucket:'second-bucket'});});
it('rejects bucket drift',async()=>{await expect(loadConnection({storage_connection_id:c.id,provider:'tigris',bucket:'other'})).rejects.toThrow('khớp');});
it('rejects provider drift',async()=>{await expect(loadConnection({storage_connection_id:c.id,provider:'b2',bucket:c.bucket})).rejects.toThrow('khớp');});
it('never falls back to another account if original is unavailable',async()=>{mocks.single.mockResolvedValue({data:null,error:{}});await expect(loadConnection({storage_connection_id:c.id,provider:'tigris',bucket:c.bucket})).rejects.toThrow();});
it('rejects missing secrets instead of default credentials',()=>{vi.stubEnv('STORAGE_CONN_SECOND_SECRET_ACCESS_KEY','');expect(()=>connectionConfig(c)).toThrow();});
it('filters unconfigured candidates without leaking secret values',async()=>{mocks.not.mockResolvedValue({data:[c,{...c,id:'bad',env_prefix:'STORAGE_CONN_MISSING'}],error:null});expect(await uploadCandidates('document')).toEqual(['second']);});
it('rejects when all candidates are unavailable',async()=>{mocks.not.mockResolvedValue({data:[],error:null});await expect(uploadCandidates('image')).rejects.toThrow();});

it('rejects changing a saved endpoint to a different account',()=>{expect(()=>connectionConfig({...c,endpoint_url:'https://original.invalid'})).toThrow('Endpoint');});
