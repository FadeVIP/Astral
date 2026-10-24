'use strict';
const {DataError}=require('./store.cjs');
const {pathParts,normalize,assign}=require('./realtime-store.cjs');
const {actor,authorizeRealtime}=require('./realtime-policy.cjs');
function leases(store,documents){
 async function register(id,user,actions){
  if(!/^[a-f0-9]{32}$/.test(id)||!user?.uid||!Array.isArray(actions)||actions.length>10)throw new DataError(400,'Invalid session');
  const c=await actor(user,documents,p=>store.get(p));
  for(const a of actions){
   const [root]=pathParts(a.path);if(!['presence','participants'].includes(root)||!['PUT','PATCH'].includes(a.method))throw new DataError(400,'Invalid disconnect action');
   const old=await store.get(a.path),now=Date.now();let next=normalize(a.body,now);
   if(a.method==='PATCH'){next=old;for(const [k,v]of Object.entries(a.body||{}))next=assign(next,pathParts(k),normalize(v,now));}
   await authorizeRealtime(c,{path:a.path,old,next,now,get:p=>store.get(p)});
  }
  await store.db.transaction(async tx=>{
   await tx.query('SELECT pg_advisory_xact_lock(71402402)');
   const old=(await tx.query('SELECT uid FROM astral_realtime_leases WHERE id=$1',[id])).rows[0];
   if(old&&old.uid!==user.uid)throw new DataError(403,'Permission denied');
   if(!old&&(await tx.query('SELECT count(*)::int n FROM astral_realtime_leases WHERE uid=$1',[user.uid])).rows[0].n>=20)throw new DataError(429,'Too many sessions');
   const principal={uid:user.uid,email:user.email||null,firebase:user.firebase||{}};
   await tx.query("INSERT INTO astral_realtime_leases(id,uid,principal,actions,expires_at) VALUES($1,$2,$3,$4,clock_timestamp()+interval '75 seconds') ON CONFLICT(id) DO UPDATE SET actions=EXCLUDED.actions,principal=EXCLUDED.principal,expires_at=EXCLUDED.expires_at",[id,user.uid,JSON.stringify(principal),JSON.stringify(actions)]);
  });
 }
 async function expire(){
  if((await store.db.query("SELECT value FROM astral_control WHERE key='authority'")).rows[0]?.value!=='sql')return;
  const rows=(await store.db.query('SELECT id,principal,actions,expires_at FROM astral_realtime_leases WHERE expires_at<clock_timestamp() ORDER BY expires_at LIMIT 100')).rows;
  for(const row of rows){const c=await actor(row.principal,documents,p=>store.get(p));for(const a of row.actions)try{await store.mutate(a.path,a.body,{patch:a.method==='PATCH',authorize:async b=>{const current=(await b.tx.query('SELECT expires_at FROM astral_realtime_leases WHERE id=$1',[row.id])).rows[0];if(!current||new Date(current.expires_at).getTime()!==new Date(row.expires_at).getTime())throw new DataError(409,'Session renewed');await authorizeRealtime(c,b);}});}catch(e){if(![403,409].includes(e.status))throw e;}await store.db.query('DELETE FROM astral_realtime_leases WHERE id=$1 AND expires_at=$2',[row.id,row.expires_at]);}
 }
 let busy=false;const timer=setInterval(async()=>{if(busy)return;busy=true;try{await expire();}catch{console.error('SQL presence expiry temporarily unavailable');}finally{busy=false;}},10000);timer.unref();
 return {register,expire,stop:()=>clearInterval(timer)};
}
module.exports={leases};
