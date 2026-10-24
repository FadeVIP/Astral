'use strict';
const {createRealtimeAdmin}=require('./realtime-admin.cjs');
const {signer}=require('./service-auth.cjs');
function remoteRealtime(base,account){
 const url=new URL(base);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('Invalid SQL endpoint');
 const token=signer(account);
 async function request(path,method='GET',value,expected){
  const result=await fetch(base.replace(/\/$/,'')+'/'+path.split('/').map(encodeURIComponent).join('/')+'.json',{method,headers:{Authorization:'Astral-Service '+token(),'Content-Type':'application/json',...(expected?{'If-Match':expected}:{})},signal:AbortSignal.timeout(18000),...(value!==undefined?{body:JSON.stringify(value)}:{})});
  if(!result.ok){const e=Error('SQL service request failed ('+result.status+')');e.status=result.status;throw e;}
  return {value:await result.json(),etag:result.headers.get('etag')};
 }
 return createRealtimeAdmin({get:async path=>(await request(path)).value,mutate:(path,value,{patch=false,expected}={})=>request(path,patch?'PATCH':'PUT',value,expected)});
}
module.exports={remoteRealtime};
