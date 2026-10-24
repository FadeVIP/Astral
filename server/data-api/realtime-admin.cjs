'use strict';
// Trusted server-only compatibility layer. Never expose this object to clients.
const {randomBytes}=require('node:crypto');
const {select,etag,pathParts}=require('./realtime-store.cjs');
function snapshot(key,value){return {key,val:()=>structuredClone(value),exists:()=>value!==null,forEach(fn){for(const [k,v]of Object.entries(value||{}))if(fn(snapshot(k,v))===true)return true;return false;}};}
function createRealtimeAdmin(store,{interval=2000}={}){
 const subscriptions=new Map();let stopped=false;
 class Reference{
  constructor(path='',options={}){this.path=pathParts(path).join('/');this.key=this.path.split('/').pop()||null;this.options=options;}
  child(path){return new Reference([this.path,path].filter(Boolean).join('/'));}
  orderByChild(value){return new Reference(this.path,{...this.options,orderBy:value});}
  orderByKey(){return new Reference(this.path,{...this.options,orderBy:'$key'});}
  startAt(value){return new Reference(this.path,{...this.options,startAt:value});}
  endAt(value){return new Reference(this.path,{...this.options,endAt:value});}
  equalTo(value){return new Reference(this.path,{...this.options,equalTo:value});}
  limitToLast(value){return new Reference(this.path,{...this.options,limitToLast:value});}
  limitToFirst(value){return new Reference(this.path,{...this.options,limitToFirst:value});}
  async once(event){if(event!=='value')throw Error('Unsupported once event');return snapshot(this.key,select(await store.get(this.path),this.options));}
  get(){return this.once('value');}
  async set(value){await store.mutate(this.path,value);}
  async update(value){await store.mutate(this.path,value,{patch:true});}
  remove(){return this.set(null);}
  push(value){const key=Date.now().toString(36).padStart(10,'0')+'_'+randomBytes(12).toString('hex'),ref=this.child(key);if(value===undefined)return ref;return ref.set(value).then(()=>ref);}
  async transaction(fn){
   for(let attempt=0;attempt<12;attempt++){
    const old=await store.get(this.path),next=fn(structuredClone(old));
    if(next===undefined)return {committed:false,snapshot:snapshot(this.key,old)};
    try{const result=await store.mutate(this.path,next,{expected:etag(old)});return {committed:true,snapshot:snapshot(this.key,result.value)};}catch(e){if(e.status!==412)throw e;}
   }throw Error('Transaction contention');
  }
  on(event,callback,onError){
   if(!['value','child_added','child_changed','child_removed'].includes(event))throw Error('Unsupported listener');
   const id=JSON.stringify([this.path,this.options]);let group=subscriptions.get(id);
   if(!group){group={ref:this,listeners:new Set(),value:null,ready:false,timer:null};subscriptions.set(id,group);}
   const listener={event,callback,onError,initialized:false};group.listeners.add(listener);
   if(group.ready)queueMicrotask(()=>{if(!listener.initialized)deliver(group,listener,null,group.value,true);});
   if(!group.started){group.started=true;queueMicrotask(()=>poll(id,group));}return callback;
  }
  off(event,callback){const id=JSON.stringify([this.path,this.options]),g=subscriptions.get(id);if(!g)return;for(const l of g.listeners)if((!event||l.event===event)&&(!callback||l.callback===callback))g.listeners.delete(l);if(!g.listeners.size){clearTimeout(g.timer);subscriptions.delete(id);}}
 }
 function deliver(group,l,before,next,initial){
  if(!group.listeners.has(l))return;
  try{
   if(l.event==='value'){if(initial||etag(before)!==etag(next))l.callback(snapshot(group.ref.key,next));}
   else if(l.event==='child_removed'){if(!initial)for(const [k,v]of Object.entries(before||{}))if(!Object.hasOwn(next||{},k))l.callback(snapshot(k,v));}
   else for(const [k,v]of Object.entries(next||{})){
    const exists=Object.hasOwn(before||{},k);
    if(l.event==='child_added'&&(initial||!exists)||l.event==='child_changed'&&!initial&&exists&&etag(before[k])!==etag(v))l.callback(snapshot(k,v));
   }
   l.initialized=true;
  }catch(e){l.onError?.(e);}
 }
 async function poll(id,g){
  try{const next=(await g.ref.once('value')).val(),before=g.value;g.value=next;g.ready=true;for(const l of g.listeners)deliver(g,l,before,next,!l.initialized);}
  catch(e){for(const l of g.listeners)l.onError?.(e);}
  if(!stopped&&subscriptions.get(id)===g){g.timer=setTimeout(()=>poll(id,g),interval);g.timer.unref();}
 }
 return {ref:path=>new Reference(path),stop(){stopped=true;for(const g of subscriptions.values())clearTimeout(g.timer);subscriptions.clear();}};
}
module.exports={createRealtimeAdmin,snapshot};
