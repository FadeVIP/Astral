import {getAuth,signInAnonymously} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
const databases=new WeakMap();
const clone=v=>structuredClone(v),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function snap(key,value){return {key,val:()=>clone(value),exists:()=>value!==null,forEach(fn){for(const [k,v]of Object.entries(value||{}))if(fn(snap(k,v))===true)return true;return false;}};}
export function getDatabase(app){
 if(databases.has(app))return databases.get(app);
 const base=globalThis.__FROSTBORNE_FIREBASE_CONFIG__?.realtimeApiUrl;
 if(!base||new URL(base).protocol!=='https:')throw Error('Сервис SQL пока не настроен.');
 const db={base:base.replace(/\/$/,''),auth:getAuth(app),groups:new Map(),disconnect:new Map(),session:crypto.randomUUID().replaceAll('-',''),connected:false};
 db.leaseTimer=setInterval(()=>renew(db).catch(()=>{}),20000);
 databases.set(app,db);return db;
}
export function ref(db,path=''){return {db,path:path.replace(/^\/+|\/+$/g,''),key:path.split('/').pop()||null,options:{}};}
export function query(r,...constraints){return {...r,options:Object.assign({},r.options,...constraints)};}
export const limitToLast=n=>({limitToLast:n});
export const limitToFirst=n=>({limitToFirst:n});
export const orderByChild=path=>({orderBy:path});
export const orderByKey=()=>({orderBy:'$key'});
export const startAt=v=>({startAt:v});
export const endAt=v=>({endAt:v});
export const equalTo=v=>({equalTo:v});
export const serverTimestamp=()=>({'.sv':'timestamp'});
async function request(r,method='GET',value,etag,expected){
 const headers={'Content-Type':'application/json'};
 if(r.db.auth.currentUser)headers.Authorization='Bearer '+await r.db.auth.currentUser.getIdToken();
 if(etag)headers['If-None-Match']=etag;
 if(expected)headers['If-Match']=expected;
 const search=new URLSearchParams(Object.entries(r.options||{}).map(([k,v])=>[k,JSON.stringify(v)]));
 const response=await fetch(r.db.base+'/'+r.path.split('/').map(encodeURIComponent).join('/')+'.json'+(search.size?'?'+search:''),{method,headers,signal:AbortSignal.timeout(18000),...(value!==undefined?{body:JSON.stringify(value)}:{})});
 if(response.status===304)return {unchanged:true};
 if(!response.ok){const e=Error('Сервис данных недоступен ('+response.status+').');e.code=response.status===403?'PERMISSION_DENIED':'UNAVAILABLE';e.status=response.status;throw e;}
 return {value:await response.json(),etag:response.headers.get('etag')};
}
export async function get(r){if(r.path==='.info/connected')return snap('connected',r.db.connected);return snap(r.key,(await request(r)).value);}
function ownValue(r,value){
 const uid=r.db.auth.currentUser?.uid,root=r.path.split('/')[0];
 if(value&&typeof value==='object'&&uid&&['chat','presence','participants','tickets','discord_links'].includes(root))return {...value,uid};
 return value;
}
async function ensureAuth(db){await db.auth.authStateReady?.();if(!db.auth.currentUser){db.signingIn??=signInAnonymously(db.auth).finally(()=>{db.signingIn=null;});await db.signingIn;}}
export async function set(r,value){await ensureAuth(r.db);await request({...r,options:{}},'PUT',ownValue(r,value));}
export async function update(r,value){await ensureAuth(r.db);await request({...r,options:{}},'PATCH',value);}
export const remove=r=>set(r,null);
export async function runTransaction(r,fn){await ensureAuth(r.db);for(let n=0;n<10;n++){const current=await request({...r,options:{}}),next=fn(clone(current.value));if(next===undefined)return {committed:false,snapshot:snap(r.key,current.value)};try{const result=await request({...r,options:{}},'PUT',next,undefined,current.etag);return {committed:true,snapshot:snap(r.key,result.value)};}catch(e){if(e.status!==412)throw e;}}throw Error('Данные изменяются слишком часто. Повторите действие.');}
export async function push(r,value){await ensureAuth(r.db);const result=await request({...r,options:{}},'POST',ownValue(r,value));return ref(r.db,r.path+'/'+result.value.name);}
function connected(db,value){if(db.connected===value)return;db.connected=value;for(const g of db.groups.values())if(g.ref.path==='.info/connected'){g.value=value;for(const l of g.listeners)l.fn(snap('connected',value));}}
function dispatch(g,l,before,next,initial){
 if(!g.listeners.has(l))return;
 try{
  if(l.event==='value'){if(initial||!same(before,next))l.fn(snap(g.ref.key,next));}
  else if(l.event==='child_removed'){if(!initial)for(const [key,v]of Object.entries(before||{}))if(!Object.hasOwn(next||{},key))l.fn(snap(key,v));}
  else for(const [key,v]of Object.entries(next||{})){
   const exists=Object.hasOwn(before||{},key);
   if(l.event==='child_added'&&(initial||!exists)||l.event==='child_changed'&&!initial&&exists&&!same(before[key],v))l.fn(snap(key,v));
  }l.initialized=true;
 }catch(e){l.error?.(e);}
}
function listen(r,event,fn,error){
 const id=JSON.stringify([r.path,r.options]),db=r.db;let g=db.groups.get(id);
 if(!g){g={ref:r,listeners:new Set(),ready:false,value:null,etag:null,failures:0,timer:null};db.groups.set(id,g);}
 const l={event,fn,error,initialized:false};g.listeners.add(l);
 if(r.path==='.info/connected'){queueMicrotask(()=>dispatch(g,l,null,db.connected,true));return ()=>off(r,event,fn);}
 if(g.ready)queueMicrotask(()=>{if(!l.initialized)dispatch(g,l,null,g.value,true);});
 if(!g.started){g.started=true;queueMicrotask(async function poll(){
  if(db.groups.get(id)!==g)return;
  try{const result=await request(r,'GET',undefined,g.etag);connected(db,true);g.failures=0;if(!result.unchanged){const old=g.value;g.value=result.value;g.etag=result.etag;g.ready=true;for(const listener of g.listeners)dispatch(g,listener,old,g.value,!listener.initialized);}}
  catch(e){g.failures++;connected(db,false);if(g.failures===1)for(const listener of g.listeners)listener.error?.(e);}
  if(db.groups.get(id)===g)g.timer=setTimeout(poll,g.failures?Math.min(30000,2000*2**g.failures):document.hidden?10000:2000);
 });}
 return ()=>off(r,event,fn);
}
export const onValue=(r,fn,error)=>listen(r,'value',fn,error);
export const onChildAdded=(r,fn,error)=>listen(r,'child_added',fn,error);
export const onChildChanged=(r,fn,error)=>listen(r,'child_changed',fn,error);
export const onChildRemoved=(r,fn,error)=>listen(r,'child_removed',fn,error);
export function off(r,event,fn){const id=JSON.stringify([r.path,r.options]),g=r.db.groups.get(id);if(!g)return;for(const l of g.listeners)if((!event||l.event===event)&&(!fn||l.fn===fn))g.listeners.delete(l);if(!g.listeners.size){clearTimeout(g.timer);r.db.groups.delete(id);}}
async function renew(db){if(!db.disconnect.size||!db.auth.currentUser)return;await request(ref(db,'__leases/'+db.session),'PUT',[...db.disconnect.values()]);}
export function onDisconnect(r){
 const save=async(method,body)=>{await ensureAuth(r.db);r.db.disconnect.set(r.path,{path:r.path,method,body});await renew(r.db);};
 return {set:body=>save('PUT',ownValue(r,body)),remove:()=>save('PUT',null),update:body=>save('PATCH',body),async cancel(){r.db.disconnect.delete(r.path);await request(ref(r.db,'__leases/'+r.db.session),'PUT',[...r.db.disconnect.values()]);}};
}
