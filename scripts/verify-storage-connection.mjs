import {createClient} from '@supabase/supabase-js';
import {loadEnv,createServer} from 'vite';
import {randomUUID} from 'node:crypto';
import {HeadObjectCommand,ListObjectVersionsCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
const arg=process.argv.indexOf('--connection'),name=process.argv[arg+1];
if(arg<0||!/^[A-Z0-9_]{2,40}$/.test(name??''))throw Error('Use --connection NAME');
const env=loadEnv('development',process.cwd(),'');Object.assign(process.env,env);
const base=process.env.STORAGE_TEST_APP_URL??'https://fpc-hub-v15.netlify.app';
const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const userClient=createClient(env.SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
let userId,token,session,runtime,store;let checks=0;
const assert=(ok,label)=>{if(!ok)throw Error(label);checks++;};
async function call(route,body){const r=await fetch(base+'/api/'+route,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Origin:new URL(base).origin},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});return {status:r.status,data:await r.json()};}
try {
 const connection=await admin.from('storage_connections').select('*').eq('env_prefix','STORAGE_CONN_'+name).single();assert(!connection.error&&['b2','tigris'].includes(connection.data?.provider),'Connection must be an existing S3 store');
 const password=randomUUID()+randomUUID();
 const created=await admin.auth.admin.createUser({email:'storage-e2e-'+randomUUID()+'@example.invalid',password,email_confirm:true});assert(!created.error,'Create disposable user');userId=created.data.user.id;
 const signed=await userClient.auth.signInWithPassword({email:created.data.user.email,password});assert(!signed.error,'Fixture sign in');token=signed.data.session.access_token;
 assert((await call('upload-url',{fileName:'probe.bin',fileType:'application/octet-stream',size:3,context:'hub'})).status===403,'Pending user must be blocked');
 const approved=await admin.from('profiles').update({approval_status:'active'}).eq('id',userId);
 if(approved.error){if(!process.argv.includes('--pause-for-approval'))throw Error('Fixture approval required');console.log(JSON.stringify({testFixtureAwaitingApproval:userId}));let active=false;for(let i=0;i<40;i++){const p=await admin.from('profiles').select('approval_status').eq('id',userId).single();if(p.data?.approval_status==='active'){active=true;break;}await new Promise(resolve=>setTimeout(resolve,3000));}assert(active,'Fixture approval timed out');}
 const issued=await admin.rpc('storage_issue_upload',{p_upload:{id:randomUUID(),owner_id:userId,candidate_ids:[connection.data.id],name:'connection-probe.bin',mime_type:'application/octet-stream',kind:'document',size:3,event_id:null,project_id:null}});
 assert(!issued.error&&issued.data?.storage_connection_id===connection.data.id,'Trusted ticket must choose the exact connection');session=issued.data;
 runtime=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
 const uploads=await runtime.ssrLoadModule('/api/_lib/upload-session.ts');const storage=await runtime.ssrLoadModule('/api/_lib/storage.ts');const registry=await runtime.ssrLoadModule('/api/_lib/storage-connections.ts');
 const ticket=await uploads.createUploadTicket(session);store=storage.objectStore(session.provider,await registry.loadConnection(session));
 const preflight=await fetch(ticket.uploadUrl,{method:'OPTIONS',headers:{Origin:new URL(base).origin,'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'content-type'},signal:AbortSignal.timeout(15000)});assert(preflight.ok&&preflight.headers.get('access-control-allow-origin')===new URL(base).origin,'Production CORS');
 const bytes=Buffer.from('abc');const put=await fetch(ticket.uploadUrl,{method:'PUT',headers:ticket.headers,body:bytes,signal:AbortSignal.timeout(20000)});assert(put.ok,'Upload to selected store');
 const saved=await call('file-metadata',{ticketId:session.id,objectId:session.storage_path});assert(saved.status===200&&saved.data.storage_connection_id===connection.data.id,'Cloud finalize with exact connection');if(session.provider==='b2')assert(!!saved.data.storage_version,'B2 version pinned');
 const read=await call('download-url',{fileId:session.id});assert(read.status===200,'Cloud download ticket');const content=await fetch(read.data.url,{signal:AbortSignal.timeout(15000)});assert(content.ok&&Buffer.from(await content.arrayBuffer()).equals(bytes),'Cloud private content matches');
 if(session.provider==='b2') {const replay=await fetch(ticket.uploadUrl,{method:'PUT',headers:ticket.headers,body:Buffer.from('xyz'),signal:AbortSignal.timeout(20000)});assert(replay.ok,'B2 replay fixture');const stable=await call('download-url',{fileId:session.id});const content=await fetch(stable.data.url,{signal:AbortSignal.timeout(15000)});assert(Buffer.from(await content.arrayBuffer()).equals(bytes),'Replay cannot replace pinned content');}
 let outsideDenied=false;try{await store.client.send(new HeadObjectCommand({Bucket:session.bucket,Key:'outside-fpc-probe/'+randomUUID()}));}catch(e){outsideDenied=e.$metadata?.httpStatusCode===403;}assert(outsideDenied,'Key cannot read outside approved prefix');
 assert((await call('file-delete',{mode:'storage',fileId:session.id})).data.success===true,'Cloud object delete');assert((await call('file-delete',{mode:'metadata',fileId:session.id})).data.success===true,'Cloud metadata delete');
 console.log(JSON.stringify({storageConnection:'PASS',connection:name,checks,site:base,secrets:'NOT_PRINTED'}));
}catch(error){console.log(JSON.stringify({storageConnection:'FAILED',connection:name,checks,error:error.message}));process.exitCode=1;}
finally {
 let clean=true;
 if(store&&session){try{if(session.provider==='b2'){const listed=await store.client.send(new ListObjectVersionsCommand({Bucket:session.bucket,Prefix:session.storage_path,MaxKeys:1000}));for(const version of [...(listed.Versions??[]),...(listed.DeleteMarkers??[])])if(version.Key===session.storage_path&&version.VersionId)await store.client.send(new DeleteObjectCommand({Bucket:session.bucket,Key:session.storage_path,VersionId:version.VersionId}));if(listed.IsTruncated)throw Error('More fixture versions remain');}else await store.client.send(new DeleteObjectCommand({Bucket:session.bucket,Key:session.storage_path}));}catch{clean=false;}finally{store.client.destroy();}}
 if(userId&&clean){await admin.from('storage_uploads').delete().eq('owner_id',userId);await admin.from('files').delete().eq('uploaded_by',userId);const removed=await admin.auth.admin.deleteUser(userId);if(removed.error)clean=false;}
 if(runtime)await runtime.close();console.log(JSON.stringify({testCleanup:clean?'PASS':'FAILED',testUser:clean?undefined:userId}));if(!clean)process.exitCode=1;
}
