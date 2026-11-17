import {loadEnv} from 'vite';
import {createClient} from '@supabase/supabase-js';
import {S3Client,GetBucketCorsCommand,PutBucketCorsCommand} from '@aws-sdk/client-s3';
const env=loadEnv('development',process.cwd(),'');
const origin='https://fpc-hub-v15.netlify.app';
const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const {data,error}=await admin.from('storage_connections').select('id,label,provider,env_prefix,bucket,endpoint_url');if(error)throw Error('Cannot list connections');
for(const c of data.filter(row=>['b2','tigris'].includes(row.provider))) {
 if(!/^(B2|TIGRIS_STORAGE|STORAGE_CONN_[A-Z0-9_]+)$/.test(c.env_prefix))throw Error('Invalid connection prefix');
 const get=suffix=>env[c.env_prefix+'_'+suffix];
 const key=get('ACCESS_KEY_ID')??get('KEY_ID'),secret=get('SECRET_ACCESS_KEY')??get('APPLICATION_KEY');
 if(!key||!secret)throw Error('Missing local configuration: '+c.label);
 const client=new S3Client({endpoint:c.endpoint_url,region:get('REGION')??'auto',credentials:{accessKeyId:key,secretAccessKey:secret},maxAttempts:2});
 try {
  let previous;try{previous=await client.send(new GetBucketCorsCommand({Bucket:c.bucket}));}catch(e){if(e.name!=='NoSuchCORSConfiguration')throw e;previous={CORSRules:[]};}
  const rules=previous.CORSRules??[];
  const covered=rules.some(rule=>(rule.AllowedOrigins??[]).includes(origin)&&(rule.AllowedMethods??[]).includes('PUT')&&(rule.AllowedHeaders??[]).some(h=>h==='*'||h.toLowerCase()==='content-type'));
  if(!covered&&process.argv.includes('--apply'))await client.send(new PutBucketCorsCommand({Bucket:c.bucket,CORSConfiguration:{CORSRules:[...rules,{ID:'fpc-netlify-origin',AllowedOrigins:[origin],AllowedMethods:['PUT','GET','HEAD'],AllowedHeaders:['Content-Type','If-None-Match'],MaxAgeSeconds:3600}]}}));
  console.log(JSON.stringify({connection:c.label,provider:c.provider,origin,cors:covered?'PRESENT':process.argv.includes('--apply')?'ADDED':'PLAN_ADD'}));
 }catch(e){console.log(JSON.stringify({connection:c.label,status:e.$metadata?.httpStatusCode??null,error:e.name}));process.exitCode=1;}finally{client.destroy();}
}
