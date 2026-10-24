import {getAuth} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {apiFor,root} from './account-api.js';
// Small REST adapter for the document operations used by the admin and star UI.
// Document names stay stable when the transport switches to PostgreSQL.
const SERVER_TIME=Symbol('server-time');
export const serverTimestamp=()=>SERVER_TIME;
export const getFirestore=app=>({request:apiFor(getAuth(app))});
export const doc=(db,...parts)=>({db,path:parts.join('/')});
export const collection=doc;
export const orderBy=(field,direction='asc')=>({orderBy:field+' '+direction});
export const limit=count=>({limit:count});
export const startAfter=snapshot=>({cursor:snapshot.nextPageToken,exhausted:!snapshot.nextPageToken});
export const query=(reference,...clauses)=>({...reference,options:Object.assign({},...clauses)});
function value(v){
 if('timestampValue'in v)return {toDate:()=>new Date(v.timestampValue),toMillis:()=>Date.parse(v.timestampValue)};
 if('integerValue'in v)return Number(v.integerValue);
 if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,value(x)]));
 if('arrayValue'in v)return (v.arrayValue.values||[]).map(value);
 return Object.values(v)[0];
}
function snapshot(row,reference,nextPageToken){return {id:reference.path.split('/').pop(),ref:reference,exists:()=>!!row,data:()=>row?Object.fromEntries(Object.entries(row.fields||{}).map(([k,v])=>[k,value(v)])):undefined,updateTime:row?.updateTime,nextPageToken};}
export async function getDoc(reference){return snapshot(await reference.db.request('/'+reference.path),reference);}
export async function getDocs(reference){
 if(reference.options?.exhausted)return {docs:[],size:0,empty:true};
 const o=reference.options||{},params=new URLSearchParams({pageSize:String(o.limit||100),orderBy:o.orderBy||'__name__'});
 if(o.cursor)params.set('pageToken',o.cursor);
 const response=await reference.db.request('/'+reference.path+'?'+params),rows=response?.documents||[];
 const docs=rows.map(row=>snapshot(row,{db:reference.db,path:row.name.slice(root.length+1)},response.nextPageToken));return {docs,size:docs.length,empty:!docs.length};
}
function encode(v){
 if(v===null)return {nullValue:null};if(typeof v==='string')return {stringValue:v};if(typeof v==='boolean')return {booleanValue:v};
 if(Number.isSafeInteger(v))return {integerValue:String(v)};if(typeof v==='number'&&Number.isFinite(v))return {doubleValue:v};
 if(Array.isArray(v))return {arrayValue:{values:v.map(encode)}};
 if(v&&typeof v==='object')return {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))}};
 throw Error('Неподдерживаемое значение документа.');
}
function write(reference,data,previous){
 const fields={},transforms=[];for(const[k,v]of Object.entries(data)){if(v===SERVER_TIME)transforms.push({fieldPath:k,setToServerValue:'REQUEST_TIME'});else fields[k]=encode(v);}
 return {update:{name:root+'/'+reference.path,fields},...(transforms.length?{updateTransforms:transforms}:{}),...(previous?{currentDocument:previous.exists()?{updateTime:previous.updateTime}:{exists:false}}:{})};
}
export async function setDoc(reference,data){await reference.db.request(':commit','POST',{writes:[write(reference,data)]});}
export async function runTransaction(db,callback){
 const reads=new Map(),writes=[];
 const result=await callback({get:async reference=>{if(writes.length)throw Error('Сначала прочитайте данные.');const row=await getDoc(reference);reads.set(reference.path,row);return row;},set:(reference,data)=>{if(!reads.has(reference.path))throw Error('Документ нужно прочитать перед изменением.');writes.push(write(reference,data,reads.get(reference.path)));}});
 if(writes.length!==reads.size)throw Error('Неподдерживаемая транзакция.');
 if(writes.length)await db.request(':commit','POST',{writes});return result;
}
