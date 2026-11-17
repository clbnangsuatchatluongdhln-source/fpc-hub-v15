import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {loadEnv} from 'vite';
const root=fileURLToPath(new URL('../',import.meta.url));
const targetId='47088215-6782-412b-8d8e-79d7d5656524';
const origin='https://fpc-hub-v15.netlify.app';
const env=loadEnv('development',root,'');
const publicKeys=['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY'];
const serverKeys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_VIDEO_BUCKET','B2_ENDPOINT','B2_REGION','B2_KEY_ID','B2_APPLICATION_KEY','B2_BUCKET','TIGRIS_STORAGE_ENDPOINT','TIGRIS_STORAGE_REGION','TIGRIS_STORAGE_ACCESS_KEY_ID','TIGRIS_STORAGE_SECRET_ACCESS_KEY','TIGRIS_STORAGE_BUCKET','IMAGEKIT_PRIVATE_KEY','IMAGEKIT_PUBLIC_KEY','IMAGEKIT_URL_ENDPOINT','STORAGE_DOCUMENT_PROVIDER','STORAGE_VIDEO_PROVIDER','APP_ORIGINS'];
const connectionIndex=process.argv.indexOf('--connection');
if(connectionIndex>=0){const name=process.argv[connectionIndex+1];if(!/^[A-Z0-9_]{2,40}$/.test(name??''))throw new Error('Invalid connection name');for(const suffix of ['ACCESS_KEY_ID','SECRET_ACCESS_KEY','ENDPOINT','REGION','PRIVATE_KEY','PUBLIC_KEY','URL_ENDPOINT'])serverKeys.push('STORAGE_CONN_'+name+'_'+suffix);}
const origins=new Set((env.APP_ORIGINS??'').split(',').map(v=>v.trim()).filter(Boolean));origins.add(origin);env.APP_ORIGINS=[...origins].join(',');env.SUPABASE_URL??=env.VITE_SUPABASE_URL;
const rows=[...publicKeys,...serverKeys].filter(key=>env[key]).map(key=>({key,scopes:[publicKeys.includes(key)?'builds':'functions'],is_secret:!publicKeys.includes(key)&&/SERVICE_ROLE|SECRET|APPLICATION_KEY|PRIVATE_KEY/.test(key),values:[{context:'production',value:env[key]}]}));
const freeTier=process.argv.includes('--free-tier');
if(freeTier)for(const row of rows){row.scopes=['builds','functions','runtime','post_processing'];row.is_secret=false;}
const summary={freeTier,site:targetId,origin,variables:rows.map(({key,scopes,is_secret})=>({key,scopes,secret:is_secret})),values:'NOT_PRINTED'};
if(!process.argv.includes('--apply')){console.log(JSON.stringify({...summary,action:'PLAN_ONLY'}));process.exit(0);}
if(!rows.some(row=>row.key==='SUPABASE_SERVICE_ROLE_KEY')||!rows.some(row=>row.key==='VITE_SUPABASE_ANON_KEY'))throw new Error('Missing mandatory configuration');
const cliRoot=process.env.NETLIFY_CLI_ROOT??process.env.PATH.split(path.delimiter).map(dir=>path.resolve(dir,'../netlify-cli')).find(dir=>existsSync(path.join(dir,'dist/utils/command-helpers.js')));
if(!cliRoot)throw new Error('Run via npm exec --yes --package=netlify-cli@27.20.0 -- node scripts/sync-netlify-env.mjs --apply');
const require=createRequire(path.join(cliRoot,'package.json'));
const {NetlifyAPI}=await import(pathToFileURL(require.resolve('@netlify/api')).href);
const {getToken}=await import(pathToFileURL(path.join(cliRoot,'dist/utils/command-helpers.js')).href);
const [token]=await getToken();if(!token)throw new Error('Run netlify login first');
const api=new NetlifyAPI(token);
const state=JSON.parse(await readFile(path.join(root,'.netlify/state.json'),'utf8'));
const site=await api.getSite({site_id:state.siteId});
if(site.id!==targetId||new URL(site.ssl_url).origin!==origin)throw new Error('Deployment target does not match reviewed plan');
const params={accountId:site.account_slug,siteId:site.id};
const current=await api.getEnvVars(params);
const fresh=rows.filter(row=>!current.some(existing=>existing.key===row.key));
if(fresh.length)await api.createEnvVars({...params,body:fresh});
for(const row of rows.filter(row=>current.some(existing=>existing.key===row.key)))await api.updateEnvVar({...params,key:row.key,body:row});
const saved=await api.getEnvVars(params);
for(const row of rows){const record=saved.find(item=>item.key===row.key);if(!record||[...record.scopes].sort().join(',')!==[...row.scopes].sort().join(','))throw new Error('Scope verification failed: '+row.key);}
console.log(JSON.stringify({...summary,action:'SYNCED',redeployRequired:true}));
