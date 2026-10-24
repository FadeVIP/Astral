'use strict';
const {ROOT,DataError} = require('./store.cjs');
const {authorize,canRead,unpack} = require('./policy.cjs');
const {isIP}=require('node:net');
const PREFIX='/api/v1/documents';
function fail(status,message) {throw new DataError(status,message);}
async function body(req) {
 let bytes=0,parts=[];for await(const part of req){bytes+=part.length;if(bytes>2*1024*1024)fail(413,'Request too large');parts.push(part);}
 try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{fail(400,'Invalid JSON');}
}
function writeFromPatch(relative,url,data) {
 if(!data || Object.keys(data).some(k=>k!=='fields'))fail(400,'Invalid document');
 const result={update:{name:ROOT+relative,fields:data.fields||{}}};
 const masks=url.searchParams.getAll('updateMask.fieldPaths');if(masks.length)result.updateMask={fieldPaths:masks};
 const exists=url.searchParams.get('currentDocument.exists'),version=url.searchParams.get('currentDocument.updateTime');
 if(exists!==null){if(!['true','false'].includes(exists))fail(400,'Invalid precondition');result.currentDocument={exists:exists==='true'};}
 if(version){if(result.currentDocument)fail(400,'Invalid precondition');result.currentDocument={updateTime:version};}
 return result;
}
function order(rows,expression='__name__') {
 const parts=expression.split(',').map(p=>p.trim().split(/\s+/));
 if(parts.length>3 || parts.some(([f,d])=>!/^(__name__|[A-Za-z][A-Za-z0-9_]*)$/.test(f)||d&&!['asc','desc'].includes(d)))fail(400,'Unsupported order');
 return rows.sort((a,b)=>{for(const [field,direction] of parts){const x=field==='__name__'?a.name:unpack(a)[field],y=field==='__name__'?b.name:unpack(b)[field];if(x!==y){const v=x===undefined?-1:y===undefined?1:x<y?-1:1;return direction==='desc'?-v:v;}}return a.name.localeCompare(b.name);});
}
function page(rows,url) {
 const size=Number(url.searchParams.get('pageSize')||100),offset=Number(url.searchParams.get('pageToken')||0);
 if(!Number.isInteger(size)||size<1||size>1000||!Number.isSafeInteger(offset)||offset<0)fail(400,'Invalid page');
 return {documents:rows.slice(offset,offset+size),...(offset+size<rows.length?{nextPageToken:String(offset+size)}:{})};
}
function matches(doc,filter) {
 if(!filter)return true;
 const f=filter.fieldFilter;if(!f||f.op!=='EQUAL'||!/^([A-Za-z][A-Za-z0-9_]*)$/.test(f.field?.fieldPath||''))fail(400,'Unsupported query');
 return JSON.stringify(doc.fields?.[f.field.fieldPath])===JSON.stringify(f.value);
}
function limiter(max,windowMs) {
 const counts=new Map();let lastClean=0;
 return key=>{const now=Date.now();if(now-lastClean>windowMs){for(const [k,v]of counts)if(v.until<=now)counts.delete(k);lastClean=now;}
 let r=counts.get(key);if(!r||r.until<=now){if(counts.size>=10000)fail(429,'Try later');r={count:0,until:now+windowMs};counts.set(key,r);}if(++r.count>max)fail(429,'Try later');};
}
function clientAddress(req,trustLoopbackProxy=false) {
 const peer=req.socket.remoteAddress || 'unknown';
 if(trustLoopbackProxy && ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer)) {
  const forwarded=req.headers['x-real-ip'];
  if(typeof forwarded==='string' && isIP(forwarded))return forwarded;
 }
 return peer;
}
function createHandler({store,verifyToken,verifyService=()=>false,origins=[],prefix=PREFIX,trustLoopbackProxy=false}) {
 const limit=limiter(240,60000);
 return async function handle(req,res) {
  let url;try{url=new URL(req.url,'http://localhost');}catch{return false;}
  if(!url.pathname.startsWith(prefix))return false;
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  try {
   const origin=req.headers.origin;
   if(origin){if(!origins.includes(origin))fail(403,'Origin denied');res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
   if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type');send(204,null);return true;}
   // Only the configured local reverse proxy may supply the actual peer IP.
   limit(clientAddress(req,trustLoopbackProxy));
   if((await store.db.query("SELECT value FROM astral_control WHERE key='authority'")).rows[0]?.value!=='sql')fail(503,'Migration is not active');
   let user=null;const header=req.headers.authorization,service=header?.startsWith('Astral-Service ')&&verifyService(header.slice(15));
   if(header&&!service){if(!/^Bearer [A-Za-z0-9_.-]{100,8192}$/.test(header))fail(401,'Invalid token');try{user=await verifyToken(header.slice(7));}catch{fail(401,'Sign in again');}}
   const suffix=decodeURIComponent(url.pathname.slice(prefix.length));
   if(req.method==='POST'&&suffix===':commit') {
    if(!user)fail(401,'Sign in required');const data=await body(req);if(Object.keys(data).some(k=>k!=='writes'))fail(400,'Unsupported commit');
    send(200,await store.commit(data.writes,b=>authorize(user,b)));return true;
   }
   const relative=suffix.replace(/^\//,'');
   if(service){if(req.method!=='GET'||! /^(members|nicknames)\/[^/]+$/.test(relative))fail(403,'Service scope denied');const d=await store.get(relative);if(!d)fail(404,'Not found');send(200,d);return true;}
   if(!relative&&suffix!==':runQuery')fail(400,'Document required');
   if(req.method==='PATCH'||req.method==='DELETE') {
    if(!user)fail(401,'Sign in required');
    const conditions=req.method==='DELETE'?writeFromPatch(relative,url,{fields:{}}).currentDocument:null;
    const w=req.method==='PATCH'?writeFromPatch(relative,url,await body(req)):{delete:ROOT+relative,...(conditions?{currentDocument:conditions}:{})};
    await store.commit([w],b=>authorize(user,b));send(200,req.method==='DELETE'?{}:await store.get(relative));return true;
   }
   // Small catalogue: reads use one consistent SQL snapshot. No Firestore calls.
   const documents=await store.all(),docs=new Map(documents.map(d=>[d.name.slice(ROOT.length),d]));
   if(req.method==='POST'&&suffix===':runQuery') {
    const {structuredQuery:q,...other}=await body(req);if(Object.keys(other).length||!q||q.from?.length!==1||q.from[0].allDescendants||!/^[A-Za-z][A-Za-z0-9_]*$/.test(q.from[0].collectionId))fail(400,'Unsupported query');
    if(Object.keys(q).some(k=>!['from','where','limit','orderBy'].includes(k)))fail(400,'Unsupported query');
    const count=q.limit??100;if(!Number.isInteger(count)||count<1||count>1000)fail(400,'Invalid query limit');
    const collection=q.from[0].collectionId;
    let rows=documents.filter(d=>{const p=d.name.slice(ROOT.length);return p.split('/').length===2&&p.startsWith(collection+'/')&&canRead(p,user,docs)&&matches(d,q.where);});
    rows=order(rows,q.orderBy?.map(o=>o.field.fieldPath+' '+(o.direction==='DESCENDING'?'desc':'asc')).join(',')||'__name__');
    send(200,rows.slice(0,count).map(document=>({document})));return true;
   }
   if(req.method!=='GET')fail(405,'Unsupported method');
   if(relative.split('/').length%2===0){const d=docs.get(relative);if(!d&&user&&relative.startsWith('supportTickets/'))fail(404,'Not found');if(!canRead(relative,user,docs))fail(403,'Permission denied');if(!d)fail(404,'Not found');send(200,d);}
   else {const rows=documents.filter(d=>{const p=d.name.slice(ROOT.length);return p.slice(0,p.lastIndexOf('/'))===relative&&canRead(p,user,docs);});send(200,page(order(rows,url.searchParams.get('orderBy')||'__name__'),url));}
  } catch(error) {const status=error instanceof DataError?error.status:503;send(status,{error:{status:status===403?'PERMISSION_DENIED':status===404?'NOT_FOUND':status===409?'ABORTED':status===401?'UNAUTHENTICATED':status===429?'RESOURCE_EXHAUSTED':'UNAVAILABLE',message:status===503?'Service unavailable':error.message}});}
  return true;
 };
}
module.exports={createHandler,writeFromPatch,matches,order,page,clientAddress};
