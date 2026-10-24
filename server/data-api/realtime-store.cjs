'use strict';
const {createHash}=require('node:crypto');
const {DataError}=require('./store.cjs');
const bad=message=>{throw new DataError(400,message);};
function pathParts(path){
 if(typeof path!=='string'||path.length>1024)bad('Invalid realtime path');
 const parts=path.replace(/^\/+|\/+$/g,'').split('/').filter(Boolean);
 if(parts.length>32||parts.some(p=>/[.#$\[\]\x00-\x1f\x7f]/.test(p)||['__proto__','constructor','prototype'].includes(p)))bad('Invalid realtime path');
 return parts;
}
function normalize(value,now=Date.now(),depth=0){
 if(depth>32)bad('Realtime value too deep');
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(!value||typeof value!=='object')bad('Invalid realtime value');
 if(!Array.isArray(value)&&Object.keys(value).length===1&&value['.sv']==='timestamp')return now;
 const result=Array.isArray(value)?[]:{};
 for(const [key,v]of Object.entries(value)){
  if(pathParts(key).length!==1||key.includes('/'))bad('Invalid realtime key');
  const next=normalize(v,now,depth+1);if(next!==null)result[key]=next;
 }
 return Object.keys(result).length?result:null;
}
function at(value,parts){for(const key of parts){if(value===null||typeof value!=='object'||!Object.hasOwn(value,key))return null;value=value[key];}return value??null;}
function assign(value,parts,next){
 if(!parts.length)return next;
 const result=value&&typeof value==='object'?structuredClone(value):{};
 const [key,...rest]=parts,child=assign(result[key],rest,next);
 if(child===null)delete result[key];else result[key]=child;
 return Object.keys(result).length?result:null;
}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
function etag(value){return '"'+createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')+'"';}
function select(value,options={}){
 if(!Object.keys(options).length)return value;
 const {orderBy='$key',startAt,endAt,equalTo,limitToFirst,limitToLast}=options;
 if(Object.keys(options).some(k=>!['orderBy','startAt','endAt','equalTo','limitToFirst','limitToLast'].includes(k)))bad('Unsupported realtime query');
 if(typeof orderBy!=='string')bad('Invalid order');
 const orderPath=['$key','$value'].includes(orderBy)?null:pathParts(orderBy);
 if(orderPath&&!orderPath.length)bad('Invalid order');
 if(limitToFirst!==undefined&&limitToLast!==undefined)bad('Conflicting limits');
 const limit=limitToFirst??limitToLast;
 if(limit!==undefined&&(!Number.isInteger(limit)||limit<1||limit>5000))bad('Invalid limit');
 const rank=v=>v===null?0:v===false?1:v===true?2:typeof v==='number'?3:typeof v==='string'?4:5;
 const cmp=(a,b)=>rank(a)-rank(b)||(a===b?0:a<b?-1:a>b?1:0);
 let rows=Object.entries(value||{}).map(([key,v])=>({key,value:v,order:orderBy==='$key'?key:orderBy==='$value'?v:at(v,orderPath)}));
 rows=rows.filter(r=>(startAt===undefined||cmp(r.order,startAt)>=0)&&(endAt===undefined||cmp(r.order,endAt)<=0)&&(equalTo===undefined||cmp(r.order,equalTo)===0));
 rows.sort((a,b)=>cmp(a.order,b.order)||(a.key<b.key?-1:a.key>b.key?1:0));
 if(limit!==undefined)rows=limitToLast!==undefined?rows.slice(-limit):rows.slice(0,limit);
 return rows.length?Object.fromEntries(rows.map(r=>[r.key,r.value])):null;
}
class RealtimeStore{
 constructor(db){this.db=db;}
 async get(path='',tx=this.db){
  const parts=pathParts(path);let rows;
  if(parts.length>=2){rows=(await tx.query('SELECT data FROM astral_realtime WHERE namespace=$1 AND node_key=$2',parts.slice(0,2))).rows;return at(rows[0]?.data??null,parts.slice(2));}
  rows=(await tx.query('SELECT namespace,node_key,data FROM astral_realtime'+(parts.length?' WHERE namespace=$1':'')+' ORDER BY namespace,node_key',parts)).rows;
  let result=null;
  for(const r of rows){const keys=r.node_key===''?[r.namespace]:[r.namespace,r.node_key];result=assign(result,parts.length?keys.slice(1):keys,r.data);}
  return result;
 }
 async replace(path,value,tx){
  const parts=pathParts(path);
  if(parts.length>=2){const base=await this.get(parts.slice(0,2).join('/'),tx),next=assign(base,parts.slice(2),value);
   // A former scalar namespace becomes an object when a child is assigned.
   await tx.query("DELETE FROM astral_realtime WHERE namespace=$1 AND node_key=''",[parts[0]]);
   if(next===null)await tx.query('DELETE FROM astral_realtime WHERE namespace=$1 AND node_key=$2',parts.slice(0,2));
   else await tx.query('INSERT INTO astral_realtime(namespace,node_key,data) VALUES($1,$2,$3) ON CONFLICT(namespace,node_key) DO UPDATE SET data=EXCLUDED.data',[...parts.slice(0,2),JSON.stringify(next)]);
   return;
  }
  if(!parts.length){await tx.query('DELETE FROM astral_realtime');for(const [key,v]of Object.entries(value||{}))await this.replace(key,v,tx);return;}
  await tx.query('DELETE FROM astral_realtime WHERE namespace=$1',parts);
  if(value===null)return;
  const entries=typeof value==='object'?Object.entries(value):[['',value]];
  for(const [key,v]of entries)await tx.query('INSERT INTO astral_realtime(namespace,node_key,data) VALUES($1,$2,$3)',[parts[0],key,JSON.stringify(v)]);
 }
 async mutate(path,input,{patch=false,expected,authorize,requireAuthority=true}={}){
  pathParts(path);
  return this.db.transaction(async tx=>{
   await tx.query('SELECT pg_advisory_xact_lock(71402402)');
   if(requireAuthority&&(await tx.query("SELECT value FROM astral_control WHERE key='authority'")).rows[0]?.value!=='sql')throw new DataError(503,'Migration is not active');
   const old=await this.get(path,tx);if(expected!==undefined&&expected!==etag(old))throw new DataError(412,'Realtime value changed');
   const now=Date.now();let next;
   if(patch){
    if(!input||typeof input!=='object'||Array.isArray(input))bad('Invalid update');
    const updates=Object.entries(input).map(([p,v])=>({parts:pathParts(p),value:normalize(v,now)}));
    for(let i=0;i<updates.length;i++){
     if(!updates[i].parts.length)bad('Empty update path');
     for(let j=0;j<i;j++){const a=updates[i].parts,b=updates[j].parts;if(a.slice(0,b.length).join('/')===b.join('/')||b.slice(0,a.length).join('/')===a.join('/'))bad('Overlapping update paths');}
    }
    next=old;for(const u of updates)next=assign(next,u.parts,u.value);
   }else next=normalize(input,now);
   if(authorize)await authorize({path,old,next,tx,now,get:p=>this.get(p,tx)});
   await this.replace(path,next,tx);return {value:next,etag:etag(next)};
  });
 }
}
module.exports={RealtimeStore,pathParts,normalize,at,assign,etag,select};
