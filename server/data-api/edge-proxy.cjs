'use strict';
const UPSTREAM='https://829504-vds-korolevikh2001vlad.gmhost.pp.ua';
// Fixed upstream, no service credentials, cookies or user-selected destinations.
function createProxy(fetcher=fetch){
 let active=0;
 return async function proxy(req,res){
  if(!/^\/api\/v1\/(?:documents(?:[/:?]|$)|realtime\/)/.test(req.url||''))return false;
  const send=(status)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:{status:'UNAVAILABLE',message:'Reserve route unavailable'}}));};
  if(!['GET','POST','PUT','PATCH','DELETE','OPTIONS'].includes(req.method)){send(405);return true;}
  if(active>=40){send(503);return true;}
  active++;
  try{
   const url=new URL(req.url,UPSTREAM);
   if(url.origin!==UPSTREAM||!url.pathname.startsWith('/api/v1/')){send(400);return true;}
   const headers={};
   for(const k of ['authorization','content-type','origin','if-match','if-none-match'])if(req.headers[k])headers[k]=req.headers[k];
   // A public proxy must never accept privileged bot credentials.
   if(headers.authorization&&!headers.authorization.startsWith('Bearer ')){send(403);return true;}
   let size=0;const chunks=[];
   for await(const chunk of req){size+=chunk.length;if(size>2*1024*1024){send(413);return true;}chunks.push(chunk);}
   const response=await fetcher(url.href,{method:req.method,headers,redirect:'error',signal:AbortSignal.timeout(18000),...(chunks.length?{body:Buffer.concat(chunks)}:{})});
   const output={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
   for(const k of ['content-type','etag','access-control-allow-origin','access-control-allow-methods','access-control-allow-headers','access-control-expose-headers','vary'])if(response.headers.has(k))output[k]=response.headers.get(k);
   const data=Buffer.from(await response.arrayBuffer());
   res.writeHead(response.status,output);res.end(data);
  }catch{if(!res.headersSent)send(502);else res.end();}finally{active--;}
  return true;
 };
}
module.exports={createProxy};
