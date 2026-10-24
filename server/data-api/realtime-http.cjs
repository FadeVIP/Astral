'use strict';
const {randomBytes}=require('node:crypto');
const {DataError}=require('./store.cjs');
const {select,etag,pathParts}=require('./realtime-store.cjs');
const {actor,canReadRealtime,authorizeRealtime}=require('./realtime-policy.cjs');
const {clientAddress}=require('./http.cjs');
function createRealtimeHandler({store,documents,verifyToken,verifyService=()=>false,leases,origins=[],trustLoopbackProxy=false}){
 const rates=new Map();let cleanup=0;
 return async(req,res)=>{
  const url=new URL(req.url,'http://localhost'),prefix='/api/v1/realtime/';if(!url.pathname.startsWith(prefix))return false;
  const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(status===304||status===204?undefined:JSON.stringify(value));};
  try{
   const origin=req.headers.origin;if(origin){if(!origins.includes(origin))throw new DataError(403,'Origin denied');res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
   res.setHeader('Access-Control-Expose-Headers','ETag');
   if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','GET,PUT,POST,PATCH,DELETE,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type,If-Match,If-None-Match');send(204);return true;}
   const now=Date.now();if(now-cleanup>60000){for(const [k,v]of rates)if(v.until<now)rates.delete(k);cleanup=now;}
   const ip=clientAddress(req,trustLoopbackProxy),r=rates.get(ip)||{until:now+60000,n:0};if(rates.size>=10000&&!rates.has(ip)||++r.n>1800)throw new DataError(429,'Try later');rates.set(ip,r);
   if((await store.db.query("SELECT value FROM astral_control WHERE key='authority'")).rows[0]?.value!=='sql')throw new DataError(503,'Migration is not active');
   if(!url.pathname.endsWith('.json'))throw new DataError(400,'JSON endpoint required');
   let path=decodeURIComponent(url.pathname.slice(prefix.length,-5));pathParts(path);
   const serviceHeader=req.headers.authorization?.startsWith('Astral-Service '),service=serviceHeader&&verifyService(req.headers.authorization.slice(15));
   if(serviceHeader&&!service)throw new DataError(401,'Invalid service identity');
   const token=serviceHeader?null:req.headers.authorization?.replace(/^Bearer /,'')||url.searchParams.get('auth');let user=null;
   if(token){try{user=await verifyToken(token);}catch{throw new DataError(401,'Sign in again');}}
   const c=await actor(user,documents,p=>store.get(p));
   if(req.method==='GET'){
    if(!service&&!await canReadRealtime(path,c,p=>store.get(p)))throw new DataError(403,'Permission denied');
    const options={};for(const [k,v]of url.searchParams)if(k!=='auth')try{options[k]=JSON.parse(v);}catch{throw new DataError(400,'Invalid query');}
    const value=select(await store.get(path),options),tag=etag(value);res.setHeader('ETag',tag);send(req.headers['if-none-match']===tag?304:200,value);return true;
   }
   if(!['PUT','POST','PATCH','DELETE'].includes(req.method))throw new DataError(405,'Unsupported method');
   let value=null;if(req.method!=='DELETE'){let size=0,parts=[];for await(const chunk of req){size+=chunk.length;if(size>2*1024*1024)throw new DataError(413,'Request too large');parts.push(chunk);}try{value=JSON.parse(Buffer.concat(parts).toString());}catch{throw new DataError(400,'Invalid JSON');}}
   let name;if(req.method==='POST'){name=Date.now().toString(36).padStart(10,'0')+'_'+randomBytes(12).toString('hex');path=[path,name].filter(Boolean).join('/');}
   if(path.startsWith('__leases/')){
    if(!leases||!user||req.method!=='PUT'||path.split('/').length!==2)throw new DataError(403,'Permission denied');
    await leases.register(path.split('/')[1],user,value);send(200,{ok:true});return true;
   }
   const result=await store.mutate(path,value,{patch:req.method==='PATCH',expected:req.headers['if-match'],authorize:service?undefined:b=>authorizeRealtime(c,b)});
   res.setHeader('ETag',result.etag);send(200,name?{name}:result.value);
  }catch(e){const status=e instanceof DataError?e.status:503;send(status,{error:status===503?'Service unavailable':e.message});}
  return true;
 };
}
module.exports={createRealtimeHandler};
