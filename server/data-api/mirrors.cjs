'use strict';
// Reuse the existing whitelisted RTDB projections, replacing only their source.
const {ROOT}=require('./store.cjs');
const {unpack}=require('./policy.cjs');
function snapshotAdapter(){
 const listeners=new Set();let documents=null;
 const snapshot=(entry)=>{
  if(entry.kind==='doc'){const d=documents.find(d=>d.name===ROOT+entry.path);return {id:entry.path.split('/').pop(),exists:!!d,data:()=>unpack(d)};}
  return {docs:documents.filter(d=>{const p=d.name.slice(ROOT.length);return p.slice(0,p.lastIndexOf('/'))===entry.path;}).map(d=>({id:d.name.split('/').pop(),exists:true,data:()=>unpack(d)}))};
 };
 const subscribe=(kind,path,fn)=>{const entry={kind,path,fn};listeners.add(entry);if(documents)fn(snapshot(entry));return ()=>listeners.delete(entry);};
 return {
  admin:{firestore:()=>({collection:path=>({onSnapshot:fn=>subscribe('collection',path,fn)}),doc:path=>({onSnapshot:fn=>subscribe('doc',path,fn)})})},
  publish(rows,changed){documents=rows;for(const entry of listeners){if(!changed||changed.some(p=>entry.kind==='doc'?p===entry.path:p.slice(0,p.lastIndexOf('/'))===entry.path))entry.fn(snapshot(entry));}}
 };
}
function startMirrors(store,realtime,{interval=2500}={}){
 const adapter=snapshotAdapter(),state={source:'postgresql',status:'starting'};
 const publicData=require('../../public-data.cjs').start(adapter.admin,realtime,{source:'postgresql'});
 const game=require('../../public-game-data.cjs').start(adapter.admin,realtime);
 require('../../social-directory.cjs').start(adapter.admin,realtime);
 let last='0',stopped=false,timer;
 async function poll(){
  try {
   const events=await store.db.query('SELECT id::text,document_path FROM astral_outbox WHERE id>$1::bigint ORDER BY id LIMIT 1000',[last]);
   if(state.status==='starting'||events.rows.length){adapter.publish(await store.all(),state.status==='starting'?null:events.rows.map(r=>r.document_path));if(events.rows.length)last=events.rows.at(-1).id;}
   state.status='live';state.checkedAt=Date.now();
  }catch{state.status=state.checkedAt?'cached':'starting';}
  if(!stopped){timer=setTimeout(poll,interval);timer.unref();}
 }
 poll();return {state,publicData,game,stop(){stopped=true;clearTimeout(timer);}};
}
module.exports={snapshotAdapter,startMirrors};
