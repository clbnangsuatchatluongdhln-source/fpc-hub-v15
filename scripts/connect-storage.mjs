import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHmac} from 'node:crypto';
import {loadEnv} from 'vite';
import {createClient} from '@supabase/supabase-js';
import {S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand,GetBucketCorsCommand,PutBucketCorsCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';

const root=fileURLToPath(new URL('../',import.meta.url));
const argument=process.argv.indexOf('--config');
if(argument<0 || !process.argv[argument+1]){console.log('node scripts/connect-storage.mjs --config C:/private/new.storage.local.json');process.exit(1);}
const env=loadEnv('development',root,'');
const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const c=JSON.parse(await readFile(path.resolve(process.argv[argument+1]),'utf8'));
if(!['tigris','b2','imagekit'].includes(c.provider) || !/^[A-Z0-9_]{2,40}$/.test(c.name??''))throw new Error('Use provider tigris/b2/imagekit and unique uppercase name');
const prefix='STORAGE_CONN_'+c.name;
const exists=await admin.from('storage_connections').select('id').eq('env_prefix',prefix).maybeSingle();
if(exists.error || exists.data)throw new Error('Connection already exists or registry unavailable; use a new name');
if(!c.label || typeof c.bucket!=='string' || !c.bucket || !Number.isSafeInteger(c.capacityMiB) || c.capacityMiB<1 || c.capacityMiB>1048576)throw new Error('Missing label, bucket or capacityMiB');
const values={};
const required=c.provider==='imagekit'?['PRIVATE_KEY','PUBLIC_KEY','URL_ENDPOINT']:['ACCESS_KEY_ID','SECRET_ACCESS_KEY','ENDPOINT','REGION'];
for(const field of required){const value=c.credentials?.[field];if(typeof value!=='string' || !value || /[\r\n"\x00]/.test(value))throw new Error('Missing or unsafe credential field '+field);values[prefix+'_'+field]=value;}
const endpoint=new URL(c.credentials[c.provider==='imagekit'?'URL_ENDPOINT':'ENDPOINT']);
if(endpoint.protocol!=='https:' || endpoint.username || endpoint.password)throw new Error('HTTPS endpoint required');
const endpointUrl=endpoint.href.replace(/\/+$/,'');
const duplicate=await admin.from('storage_connections').select('id').eq('provider',c.provider).eq('endpoint_url',endpointUrl).eq('bucket',c.bucket).maybeSingle();
if(duplicate.error || duplicate.data)throw new Error('This bucket/account already has a connection; do not register it twice');
const row={endpoint_url:endpointUrl,label:String(c.label).slice(0,100),provider:c.provider,env_prefix:prefix,bucket:c.bucket,capacity_bytes:c.capacityMiB*1048576,write_enabled:true};
for(const kind of ['image','document','video']){const priority=c.priorities?.[kind]??null;if(priority!==null && (!Number.isInteger(priority)||priority<1||priority>1000))throw new Error('Priority must be 1..1000 or null');row[kind+'_priority']=priority;}
if(c.provider==='imagekit' && (row.document_priority || row.video_priority))throw new Error('ImageKit accepts raster images only');
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const key='fpc-hub/_connection-tests/'+randomUUID()+'.png';
if(c.provider==='imagekit') {
 const headers={Authorization:'Basic '+Buffer.from(c.credentials.PRIVATE_KEY+':').toString('base64')};let id;
 try {
  const form=new FormData();form.append('file',new Blob([bytes],{type:'image/png'}),'test.png');form.append('fileName',key.split('/').pop());form.append('folder','/fpc-hub/_connection-tests');form.append('isPrivateFile','true');form.append('useUniqueFileName','false');
  const upload=await fetch('https://upload.imagekit.io/api/v1/files/upload',{method:'POST',headers,body:form,signal:AbortSignal.timeout(30000)});
  if(!upload.ok)throw new Error('ImageKit upload verification failed');const data=await upload.json();id=data.fileId;
  if(!id || data.isPrivateFile!==true)throw new Error('ImageKit did not create a private image');
  const filePath=data.filePath.replace(/^\//,'');const expires=Math.floor(Date.now()/1000)+60;
  const signature=createHmac('sha1',c.credentials.PRIVATE_KEY).update(filePath+expires).digest('hex');
  const read=await fetch(endpoint.href.replace(/\/$/,'')+'/'+filePath+'?ik-t='+expires+'&ik-s='+signature,{signal:AbortSignal.timeout(15000)});
  if(!read.ok || !Buffer.from(await read.arrayBuffer()).equals(bytes))throw new Error('ImageKit endpoint or private read verification failed');
 } finally {
  if(id){const removed=await fetch('https://api.imagekit.io/v1/files/'+encodeURIComponent(id),{method:'DELETE',headers,signal:AbortSignal.timeout(15000)});if(!removed.ok && removed.status!==404)throw new Error('Probe cleanup failed; connection was not registered');}
 }
} else {
 const client=new S3Client({endpoint:endpoint.href,region:c.credentials.REGION,credentials:{accessKeyId:c.credentials.ACCESS_KEY_ID,secretAccessKey:c.credentials.SECRET_ACCESS_KEY},maxAttempts:2});let version,uploaded=false;
 try {
  const put=await client.send(new PutObjectCommand({Bucket:c.bucket,Key:key,Body:bytes,ContentType:'image/png',...(c.provider==='tigris'?{IfNoneMatch:'*'}:{})}));uploaded=true;version=put.VersionId;
  if(c.provider==='b2' && !version)throw new Error('B2 version identity missing');
  const read=await client.send(new GetObjectCommand({Bucket:c.bucket,Key:key,VersionId:version}));
  if(!Buffer.from(await read.Body.transformToByteArray()).equals(bytes))throw new Error('Object read mismatch');
  const origins=(env.APP_ORIGINS??'').split(',').map(v=>v.trim()).filter(Boolean);
  if(!origins.length)throw new Error('APP_ORIGINS must contain browser origins');
  const url=await getSignedUrl(client,new PutObjectCommand({Bucket:c.bucket,Key:key,ContentType:'image/png'}),{expiresIn:60});
  async function corsReady(){for(const origin of origins){const r=await fetch(url,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':c.provider==='tigris'?'content-type,if-none-match':'content-type'},signal:AbortSignal.timeout(15000)});if(!r.ok || r.headers.get('access-control-allow-origin')!==origin)return false;}return true;}
  if(!await corsReady()) {
   let old;try{old=await client.send(new GetBucketCorsCommand({Bucket:c.bucket}));}catch(error){if(!['NoSuchCORSConfiguration','NoSuchCorsConfiguration'].includes(error.name))throw error;old={CORSRules:[]};}
   const rules=old.CORSRules??[];
   await client.send(new PutBucketCorsCommand({Bucket:c.bucket,CORSConfiguration:{CORSRules:[...rules,{AllowedOrigins:origins,AllowedMethods:['PUT','GET','HEAD'],AllowedHeaders:['Content-Type','If-None-Match'],MaxAgeSeconds:3600}]}}));
   if(!await corsReady())throw new Error('Browser CORS verification failed');
  }
 } finally {try{if(uploaded)await client.send(new DeleteObjectCommand({Bucket:c.bucket,Key:key,VersionId:version}));}finally{client.destroy();}}
}
const file=path.join(root,'.env.local');let current=await readFile(file,'utf8');
if(Object.keys(values).some(name=>new RegExp('^'+name+'=','m').test(current)))throw new Error('Environment namespace already exists; use a fresh connection name');
current+='\n'+Object.entries(values).map(([k,v])=>k+'="'+v+'"').join('\n')+'\n';await writeFile(file,current,{mode:0o600});
const created=await admin.from('storage_connections').insert(row).select('id,label,provider').single();
if(created.error)throw new Error('Verified credentials saved locally but registry insert failed; inspect configuration');
console.log(JSON.stringify({connected:created.data,verified:['upload','private read','delete',...(c.provider==='imagekit'?[]:['browser CORS'])],restart:'Restart dev/server to load new credentials; production needs the same env names'}));
