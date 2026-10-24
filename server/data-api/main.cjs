'use strict';
const http=require('node:http');
const admin=require('firebase-admin');
const {DocumentStore,postgres}=require('./store.cjs');
const {createHandler}=require('./http.cjs');
const {startMirrors}=require('./mirrors.cjs');
const {RealtimeStore}=require('./realtime-store.cjs');
const {createRealtimeAdmin}=require('./realtime-admin.cjs');
const {createRealtimeHandler}=require('./realtime-http.cjs');
async function start(){
 admin.initializeApp({credential:admin.credential.applicationDefault(),projectId:'astral-524a1',databaseURL:'https://astral-524a1-default-rtdb.europe-west1.firebasedatabase.app'});
 const db=postgres(process.env.DATABASE_URL || undefined,process.env.DATABASE_URL?{}:{host:process.env.PGHOST||'/var/run/postgresql',database:process.env.PGDATABASE||'astral',user:process.env.PGUSER||'astral-data'});
 const store=new DocumentStore(db); // Schema is installed separately by the owner.
 const tokens=new Map();
 async function verifyToken(token){
  const now=Date.now(),cached=tokens.get(token);if(cached&&cached.until>now)return cached.user;
  const user=await admin.auth().verifyIdToken(token,true);
  if(tokens.size>=1000){for(const [key,v]of tokens)if(v.until<=now)tokens.delete(key);if(tokens.size>=1000)tokens.delete(tokens.keys().next().value);}
  tokens.set(token,{user,until:Math.min(now+30000,user.exp*1000)});return user;
 }
 const verifyService=require('./service-auth.cjs').verifier(JSON.parse(require('node:fs').readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS,'utf8')));
 const handler=createHandler({store,verifyToken,verifyService,trustLoopbackProxy:process.env.TRUST_LOOPBACK_PROXY==='true',origins:(process.env.ALLOWED_ORIGINS||'https://astral-mine-mirror.onrender.com,https://astral-mine-web.vercel.app').split(',')});
 const realtime=new RealtimeStore(db),realtimeAdmin=createRealtimeAdmin(realtime);
 const leases=require('./realtime-leases.cjs').leases(realtime,store);
 const realtimeHandler=createRealtimeHandler({store:realtime,documents:store,verifyToken,verifyService,leases,trustLoopbackProxy:process.env.TRUST_LOOPBACK_PROXY==='true',origins:(process.env.ALLOWED_ORIGINS||'https://astral-mine-mirror.onrender.com,https://astral-mine-web.vercel.app').split(',')});
 let mirrors;
 const server=http.createServer(async(req,res)=>{
  try {
   if(req.url==='/health') {await db.query('SELECT 1');res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ok:true,service:'astral-data',backend:'postgresql',mirrors:mirrors?.state.status||'disabled'}));return;}
   if(!await handler(req,res)&&!await realtimeHandler(req,res)){res.writeHead(404);res.end();}
  }catch{if(!res.headersSent)res.writeHead(503);res.end();}
 });
 server.requestTimeout=20000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(process.env.PORT||3001),'127.0.0.1',resolve);});
 // Explicit deployment switch, never publish a rehearsal snapshot to players.
 if(process.env.PUBLISH_SQL_MIRRORS==='true') {
  const authority=(await db.query("SELECT value FROM astral_control WHERE key='authority'")).rows[0]?.value;
  if(authority!=='sql')throw Error('Mirror authority is not SQL');
  mirrors=startMirrors(store,realtimeAdmin);
 }
 async function stop(){mirrors?.stop();leases.stop();realtimeAdmin.stop();server.close();await db.close();process.exit(0);}
 process.on('SIGTERM',stop);process.on('SIGINT',stop);
 console.log('Astral data API listening on loopback');
}
if(require.main===module)start().catch(()=>{console.error('Astral data API startup failed');process.exit(1);});
module.exports={start};
