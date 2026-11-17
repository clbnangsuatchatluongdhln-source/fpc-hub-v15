import type {VercelRequest,VercelResponse} from '@vercel/node';
type Handler=(request:VercelRequest,response:VercelResponse)=>Promise<unknown>;
export function createBridge(routes:Record<string,Handler>) {
 return async(request:Request):Promise<Response>=>{
  const path=new URL(request.url).pathname;
  const name=path.startsWith('/api/')?path.slice(5):path.startsWith('/.netlify/functions/gateway/')?path.slice('/.netlify/functions/gateway/'.length):'';
  const handler=Object.hasOwn(routes,name)?routes[name]:undefined;
  if(!handler)return Response.json({error:'Không tìm thấy API'},{status:404});
  const headers=new Headers({'Cache-Control':'no-store'});let status=200,body:string|null=null;
  let input:unknown={};
  if(request.method!=='OPTIONS' && request.body) {
   const reader=request.body.getReader();const chunks:Uint8Array[]=[];let size=0;
   while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>32768){await reader.cancel();return Response.json({error:'Dữ liệu quá lớn'},{status:413});}chunks.push(part.value);}
   try{const raw=Buffer.concat(chunks).toString('utf8');input=raw?JSON.parse(raw):{};}catch{return Response.json({error:'JSON không hợp lệ'},{status:400});}
  }
  const req={method:request.method,headers:Object.fromEntries(request.headers),body:input} as VercelRequest;
  const res={status(code:number){status=code;return res;},setHeader(key:string,value:string|number|readonly string[]){headers.set(key,String(value));return res;},json(value:unknown){headers.set('Content-Type','application/json; charset=utf-8');body=JSON.stringify(value);return res;},end(value?:string){body=value??null;return res;}};
  try{await handler(req,res as unknown as VercelResponse);}catch{return Response.json({error:'API tạm thời không khả dụng'},{status:503,headers:{'Cache-Control':'no-store'}});}
  return new Response(status===204?null:body,{status,headers});
 };
}
