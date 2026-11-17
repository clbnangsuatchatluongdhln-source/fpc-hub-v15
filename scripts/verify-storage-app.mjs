import {createClient} from '@supabase/supabase-js';
import {loadEnv,createServer} from 'vite';
import {randomUUID} from 'node:crypto';

const env=loadEnv('development',process.cwd(),'');
Object.assign(process.env,env);
const url=env.SUPABASE_URL || env.VITE_SUPABASE_URL;
if(!url || !env.SUPABASE_SERVICE_ROLE_KEY)throw new Error('Missing server configuration');
const admin=createClient(url,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const userClient=createClient(url,env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const base=process.env.STORAGE_TEST_APP_URL || 'http://127.0.0.1:5173';
const password=randomUUID()+randomUUID();
let userId,token;
const governanceFixtures={event:null,job:null,connection:null};
const files=[];
const issued=[];
let checks=0;
function assert(condition,label){if(!condition)throw new Error(label);checks++;}
async function call(path,body,auth=true){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});return {status:r.status,data:await r.json()};}
try {
  const created=await admin.auth.admin.createUser({email:'storage-e2e-'+randomUUID()+'@example.invalid',password,email_confirm:true});
  if(created.error)throw new Error('Cannot create temporary test user');
  userId=created.data.user.id;
  const signed=await userClient.auth.signInWithPassword({email:created.data.user.email,password});
  if(signed.error)throw new Error('Cannot authenticate test user');
  token=signed.data.session.access_token;
  const input={fileName:'storage-test.txt',fileType:'text/plain',size:3,context:'hub'};
  assert((await call('/api/upload-url',input)).status===403,'Pending upload must be denied');
  const activated=await admin.from('profiles').update({approval_status:'active'}).eq('id',userId);
  if(activated.error) {
    if(!process.argv.includes('--pause-for-approval'))throw new Error('Fixture approval requires database test setup');
    console.log(JSON.stringify({testFixtureAwaitingApproval:userId}));
    let active=false;
    for(let i=0;i<40;i++) {
      const profile=await admin.from('profiles').select('approval_status').eq('id',userId).single();
      if(profile.data?.approval_status==='active'){active=true;break;}
      await new Promise(resolve=>setTimeout(resolve,3000));
    }
    if(!active)throw new Error('Fixture approval timed out');
  }
  const overview=await call('/api/storage-control',{action:'overview'});
  assert(overview.status===200 && overview.data.admin===false,'Member storage dashboard');
  assert(overview.data.users.length===1 && overview.data.users[0].id===userId,'Dashboard isolates member quota');
  assert(overview.data.connections.length===0,'Member cannot enumerate connection configuration');
  for(const action of ['save-limit','save-connection','scan','run-due'])assert((await call('/api/storage-control',{action})).status===403,'Member cannot administer '+action);
  assert((await call('/api/file-metadata',{name:'forged',storagePath:'victim',context:'project'})).status===400,'Forged metadata must fail');
  const spoof=await userClient.from('files').insert({name:'forged',storage_path:'forged/'+randomUUID(),uploaded_by:userId});
  assert(!!spoof.error,'Direct metadata insert must fail');
  const oldApi=await admin.from('files').insert({name:'old-api-forged',storage_path:'old-api-forged/'+randomUUID(),uploaded_by:userId});
  assert(!!oldApi.error,'Legacy service API cannot bypass upload provenance');
  for(const kind of ['document','image','video']) {
    const image=kind==='image';
    const video=kind==='video';
    const bytes=image?Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBf0AAAAASUVORK5CYII=','base64'):Buffer.from('abc');
    const prepared=await call('/api/upload-url',{...input,fileName:image?'test.png':video?'test.mp4':'test.txt',fileType:image?'image/png':video?'video/mp4':'text/plain',size:bytes.length});
    assert(prepared.status===200,'Ticket creation must succeed');
    const ticket=prepared.data;issued.push(ticket.ticketId);
    assert(ticket.provider===(image?'imagekit':video?(env.STORAGE_VIDEO_PROVIDER??'tigris'):(env.STORAGE_DOCUMENT_PROVIDER??'tigris')),'Server must select the configured provider');
    let objectId=ticket.storagePath;
    if(image){const form=new FormData();form.append('file',new Blob([bytes],{type:'image/png'}),'test.png');form.append('token',ticket.token);for(const[k,v]of Object.entries(ticket.fields))form.append(k,String(v));const r=await fetch('https://upload.imagekit.io/api/v2/files/upload',{method:'POST',body:form,signal:AbortSignal.timeout(20000)});assert(r.ok,'Image upload');objectId=(await r.json()).fileId;}
    else{const r=await fetch(ticket.uploadUrl,{method:'PUT',body:bytes,headers:ticket.headers,signal:AbortSignal.timeout(20000)});assert(r.ok,'Object upload');}
    const record=await call('/api/file-metadata',{ticketId:ticket.ticketId,objectId});
    assert(record.status===200,'Finalize must succeed');files.push(record.data);
    if(ticket.provider==='b2') {
      assert(!!record.data.storage_version,'B2 metadata must pin verified version');
      const replayUpload=await fetch(ticket.uploadUrl,{method:'PUT',body:Buffer.from('xyz'),headers:ticket.headers,signal:AbortSignal.timeout(20000)});
      assert(replayUpload.ok,'B2 replay fixture writes another version');
    }
    assert(record.data.uploaded_by===userId,'Owner derived from identity');
    const replay=await call('/api/file-metadata',{ticketId:ticket.ticketId,objectId});
    assert(replay.status===200 && replay.data.id===record.data.id,'Replay must be idempotent');
    const download=await call('/api/download-url',{fileId:record.data.id});
    assert(download.status===200,'Authorized download');
    const response=await fetch(download.data.url,{signal:AbortSignal.timeout(15000)});
    assert(response.ok && Buffer.from(await response.arrayBuffer()).equals(bytes),'Download content matches');
    assert((await call('/api/download-url',{fileId:record.data.id},false)).status===401,'Anonymous download denied');
    const removed=await call('/api/file-delete',{mode:'storage',fileId:record.data.id});assert(removed.data.success===true,'Storage delete');
    assert((await call('/api/file-delete',{mode:'metadata',fileId:record.data.id})).data.success===true,'Metadata delete');
    if(ticket.provider==='b2')await admin.from('storage_uploads').update({expires_at:'2000-01-01T00:00:00Z'}).eq('id',ticket.ticketId);
  }
  const expired=await call('/api/upload-url',input);
  assert(expired.status===200,'Expired reservation fixture');
  issued.push(expired.data.ticketId);
  const expiry=await admin.from('storage_uploads').update({expires_at:'2000-01-01T00:00:00Z'}).eq('id',expired.data.ticketId);
  assert(!expiry.error,'Expire test reservation');
  const runtime=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
  try {
    const {cleanupExpiredUploads}=await runtime.ssrLoadModule('/api/_lib/storage-cleanup.ts');
    const cleaned=await cleanupExpiredUploads();
    assert(cleaned.removed>=1 && cleaned.failed===0,'Expired reservation cleanup');
    const remaining=await admin.from('storage_uploads').select('id').eq('id',expired.data.ticketId).maybeSingle();
    assert(!remaining.error && !remaining.data,'Expired reservation releases capacity');
  } finally {await runtime.close();}
  if(process.argv.includes('--pause-for-admin')) {
    console.log(JSON.stringify({testFixtureAwaitingAdmin:userId}));
    let authorized=false;
    for(let attempt=0;attempt<40;attempt++){const role=await admin.from('profiles').select('role').eq('id',userId).single();if(role.data?.role==='admin'){authorized=true;break;}await new Promise(resolve=>setTimeout(resolve,3000));}
    assert(authorized,'Admin fixture setup');
    const dashboard=await call('/api/storage-control',{action:'overview'});
    assert(dashboard.status===200 && dashboard.data.admin===true,'Admin storage dashboard');
    assert(dashboard.data.connections.filter(c=>c.configured).length>=3,'Default provider connections configured');
    const config={action:'save-limit',user_id:userId,enabled:true,max_file_bytes:104857600,daily_bytes:209715200,daily_count:0,total_bytes:524288000};
    assert((await call('/api/storage-control',config)).status===200,'Admin edits account quota');
    assert((await call('/api/upload-url',input)).status===429,'Live API enforces zero upload count');
    assert((await call('/api/storage-control',{...config,daily_count:50})).status===200,'Admin restores quota');
    const connectionId=randomUUID();
    const connection={id:connectionId,label:'Isolated governance test',provider:'imagekit',env_prefix:'STORAGE_CONN_TEST_'+connectionId.replaceAll('-','').toUpperCase(),bucket:'imagekit',endpoint_url:'https://fixture.invalid/'+connectionId,write_enabled:false,capacity_bytes:1048576};
    const createdConnection=await admin.from('storage_connections').insert(connection);
    assert(!createdConnection.error,'Create isolated connection fixture');governanceFixtures.connection=connectionId;
    const edit={action:'save-connection',...connection,reported_used_bytes:0,image_priority:10,document_priority:null,video_priority:null,warn_percent:80,stop_percent:90};
    assert((await call('/api/storage-control',edit)).status===200,'Admin configures connection limits');
    assert((await call('/api/storage-control',{...edit,warn_percent:95})).status===400,'Invalid capacity thresholds denied');
    assert((await call('/api/storage-control',{...edit,video_priority:10})).status===400,'ImageKit cannot accept videos');
    const event=await admin.from('events').insert({title:'Storage governance test',visibility:'private',created_by:userId,start_time:new Date(Date.now()-101*86400000).toISOString(),end_time:new Date(Date.now()-100*86400000).toISOString()}).select().single();
    assert(!event.error,'Create old private event fixture');governanceFixtures.event=event.data.id;
    const job=await admin.from('storage_retention_jobs').insert({source_event_id:event.data.id,event_id:event.data.id,title:event.data.title,event_snapshot:event.data}).select().single();
    assert(!job.error,'Create retention fixture');governanceFixtures.job=job.data.id;
    assert((await call('/api/storage-control',{action:'approve',id:job.data.id,audience:'club'})).status===409,'Live API forbids private club-wide notice');
    assert((await call('/api/storage-control',{action:'approve',id:job.data.id,audience:'related'})).status===200,'Admin schedules approved event');
    const notice=await userClient.from('notifications').select('id,title').eq('event_id',event.data.id);
    assert(!notice.error && notice.data.some(n=>n.title==='Sự kiện sắp bị xóa'),'User reads upcoming deletion notification');
    const scheduled=await admin.from('storage_retention_jobs').select('state,delete_after').eq('id',job.data.id).single();
    assert(scheduled.data.state==='scheduled' && new Date(scheduled.data.delete_after)>new Date(Date.now()+6*86400000),'Seven day waiting period persisted');
    assert((await call('/api/storage-control',{action:'hold',id:job.data.id,reason:'Fixture keep request'})).status===200,'Keep request stops deletion');
    const held=await admin.from('storage_retention_jobs').select('state,delete_after').eq('id',job.data.id).single();
    assert(held.data.state==='retained' && held.data.delete_after===null,'Keep state persisted');
  }
  console.log(JSON.stringify({appStorage:'PASS',checks,providers:['tigris','imagekit',env.STORAGE_VIDEO_PROVIDER??'tigris']}));
} catch(error){console.log(JSON.stringify({appStorage:'FAILED',checks,error:error.message}));process.exitCode=1;}
finally {
  if(governanceFixtures.job)await admin.from('storage_retention_jobs').delete().eq('id',governanceFixtures.job);
  if(governanceFixtures.event)await admin.from('events').delete().eq('id',governanceFixtures.event);
  if(governanceFixtures.connection)await admin.from('storage_connections').delete().eq('id',governanceFixtures.connection);
  for(const file of files){try{await call('/api/file-delete',{mode:'storage',fileId:file.id});}catch{}}
  if(userId){await admin.from('storage_uploads').delete().eq('owner_id',userId);await admin.from('files').delete().eq('uploaded_by',userId);const result=await admin.auth.admin.deleteUser(userId);console.log(JSON.stringify({testUserCleanup:result.error?'FAILED':'PASS'}));if(result.error)process.exitCode=1;}
}
