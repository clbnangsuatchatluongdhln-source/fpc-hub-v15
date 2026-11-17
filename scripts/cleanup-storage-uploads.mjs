import {createServer,loadEnv} from 'vite';
Object.assign(process.env,loadEnv('development',process.cwd(),''));
const server=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
try {
  const {cleanupExpiredUploads}=await server.ssrLoadModule('/api/_lib/storage-cleanup.ts');
  const result=await cleanupExpiredUploads();
  console.log(JSON.stringify(result));
  if(result.failed)process.exitCode=1;
} finally {await server.close();}
