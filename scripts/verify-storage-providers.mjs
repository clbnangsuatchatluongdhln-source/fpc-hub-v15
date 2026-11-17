import {createServer,loadEnv} from 'vite';
import {randomUUID,createHmac} from 'node:crypto';
import {DeleteObjectCommand,GetObjectCommand,ListObjectVersionsCommand} from '@aws-sdk/client-s3';

Object.assign(process.env,loadEnv('development',process.cwd(),''));
const server=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
try {
  const {createUploadTicket,verifyUploadedObject}=await server.ssrLoadModule('/api/_lib/upload-session.ts');
  const {objectStore}=await server.ssrLoadModule('/api/_lib/storage.ts');
  for(const provider of ['tigris','b2','imagekit']) {
    const id=randomUUID();
    const image=provider==='imagekit';
    const bytes=image?Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBf0AAAAASUVORK5CYII=','base64'):Buffer.from('FPC storage test '+id);
    const session={id,owner_id:id,provider,bucket:'imagekit',storage_path:`${image?'/':''}fpc-hub/_connection-tests/${id}.${image?'png':'txt'}`,size:bytes.length,mime_type:image?'image/png':'text/plain',kind:image?'image':'document'};
    let uploadedId;
    let store;
    try {
      if(!image){store=objectStore(provider);session.bucket=store.bucket;}
      const ticket=await createUploadTicket(session);
      let response;
      if(image) {
        const form=new FormData();form.append('file',new Blob([bytes],{type:'image/png'}),'test.png');form.append('token',ticket.token);
        for(const [key,value] of Object.entries(ticket.fields))form.append(key,String(value));
        response=await fetch('https://upload.imagekit.io/api/v2/files/upload',{method:'POST',body:form,signal:AbortSignal.timeout(20000)});
        const body=await response.json();
        if(!response.ok)throw new Error(`Upload HTTP ${response.status}: ${body.message??'failed'}`);
        uploadedId=body.fileId;
        await verifyUploadedObject(session,uploadedId);
        const plain=await fetch(body.url,{signal:AbortSignal.timeout(15000)});await plain.body?.cancel();
        if(plain.ok)throw new Error('Private image is publicly readable');
        const endpoint=process.env.IMAGEKIT_URL_ENDPOINT.replace(/\/+$/,'');
        const path=body.filePath.split('/').filter(Boolean).map(encodeURIComponent).join('/');
        const expiry=Math.floor(Date.now()/1000)+300;
        const signature=createHmac('sha1',process.env.IMAGEKIT_PRIVATE_KEY).update(path+expiry).digest('hex');
        const signed=await fetch(`${endpoint}/${path}?ik-t=${expiry}&ik-s=${signature}`,{signal:AbortSignal.timeout(15000)});
        if(!signed.ok)throw new Error(`Signed read HTTP ${signed.status}`);
        if(!Buffer.from(await signed.arrayBuffer()).equals(bytes))throw new Error('Read content mismatch');
      } else {
        response=await fetch(ticket.uploadUrl,{method:'PUT',body:bytes,headers:ticket.headers,signal:AbortSignal.timeout(20000)});
        if(!response.ok)throw new Error(`Upload HTTP ${response.status}`);
        uploadedId=session.storage_path;
        const verified=await verifyUploadedObject(session,uploadedId);
        const unsignedUrl=new URL(ticket.uploadUrl);unsignedUrl.search='';
        const unsigned=await fetch(unsignedUrl,{signal:AbortSignal.timeout(15000)});await unsigned.body?.cancel();
        if(unsigned.ok)throw new Error('Object is publicly readable without a signature');
        const replayBytes=provider==='b2'?Buffer.from(bytes):bytes;
        if(provider==='b2')replayBytes[0]=replayBytes[0]===65?66:65;
        const replay=await fetch(ticket.uploadUrl,{method:'PUT',body:replayBytes,headers:ticket.headers,signal:AbortSignal.timeout(20000)});
        if(provider!=='b2' && replay.ok)throw new Error('Upload replay overwrote an object');
        if(provider==='b2' && (!replay.ok || !verified.version))throw new Error('Cannot verify B2 version isolation');
        const read=await store.client.send(new GetObjectCommand({Bucket:store.bucket,Key:uploadedId,VersionId:verified.version??undefined}));
        if(!Buffer.from(await read.Body.transformToByteArray()).equals(bytes))throw new Error('Read content mismatch');
      }
      console.log(JSON.stringify({provider,upload:'PASS',verify:'PASS',read:'PASS'}));
    } catch(error) {
      console.log(JSON.stringify({provider,result:'NOT_READY',reason:error.message}));
      process.exitCode=1;
    } finally {
      if(uploadedId) {
        try {
          if(image){const response=await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(uploadedId)}`,{method:'DELETE',headers:{Authorization:`Basic ${Buffer.from(process.env.IMAGEKIT_PRIVATE_KEY+':').toString('base64')}`},signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Cleanup rejected');}
          else if(provider==='b2') {
            const versions=await store.client.send(new ListObjectVersionsCommand({Bucket:store.bucket,Prefix:uploadedId}));
            for(const item of [...(versions.Versions??[]),...(versions.DeleteMarkers??[])])if(item.Key===uploadedId && item.VersionId)await store.client.send(new DeleteObjectCommand({Bucket:store.bucket,Key:uploadedId,VersionId:item.VersionId}));
          } else await store.client.send(new DeleteObjectCommand({Bucket:store.bucket,Key:uploadedId}));
          console.log(JSON.stringify({provider,cleanup:'PASS'}));
        } catch {console.log(JSON.stringify({provider,cleanup:'FAILED',testObject:uploadedId}));process.exitCode=1;}
      }
      store?.client.destroy();
    }
  }
} finally {await server.close();}
