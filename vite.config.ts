import { defineConfig, loadEnv, type Plugin } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import type { VercelRequest, VercelResponse } from '@vercel/node';

function localStorageApi():Plugin {
  const routes=new Set(['/api/upload-url','/api/file-metadata','/api/download-url','/api/file-delete','/api/storage-control']);
  return {
    name:'fpc-local-storage-api',apply:'serve',
    configureServer(server) {
      const runtime=globalThis as typeof globalThis & {fpcStorageEnvOriginal?:Map<string,string|undefined>};
      const original=runtime.fpcStorageEnvOriginal??=new Map();
      for(const [key,value] of original) {
        if(value===undefined)delete process.env[key];
        else process.env[key]=value;
      }
      const env=loadEnv(server.config.mode,server.config.root,'');
      for(const [key,value] of Object.entries(env)) {
        if(/^(SUPABASE_|B2_|TIGRIS_|IMAGEKIT_|R2_|STORAGE_)/.test(key) || key==='APP_ORIGINS') {
          if(!original.has(key))original.set(key,process.env[key]);
          process.env[key]=value;
        }
      }
      process.env.SUPABASE_URL ||= env.VITE_SUPABASE_URL;
      server.middlewares.use(async(req,res,next)=>{
        const path=req.url?.split('?')[0]??'';
        if(!routes.has(path))return next();
        res.setHeader('Cache-Control','no-store');
        if(!process.env.SUPABASE_SERVICE_ROLE_KEY) {
          res.statusCode=503;res.setHeader('Content-Type','application/json');
          return res.end(JSON.stringify({error:'API local thiếu cấu hình xác thực server Supabase'}));
        }
        try {
          let body='';
          for await(const chunk of req) {
            body+=chunk.toString();
            if(Buffer.byteLength(body)>32768){res.statusCode=413;res.end();return;}
          }
          const request=req as VercelRequest;
          try {request.body=body?JSON.parse(body):{};}catch{res.statusCode=400;res.end();return;}
          const response=res as VercelResponse;
          response.status=(status:number)=>{res.statusCode=status;return response;};
          response.json=(value:unknown)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return response;};
          const module=await server.ssrLoadModule(`${path}.ts`);
          await module.default(request,response);
        } catch {
          if(!res.headersSent){res.statusCode=503;res.setHeader('Content-Type','application/json');}
          if(!res.writableEnded)res.end(JSON.stringify({error:'API lưu trữ chưa sẵn sàng; kiểm tra cấu hình server'}));
        }
      });
    },
  };
}

export default defineConfig({
  plugins:[localStorageApi()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
