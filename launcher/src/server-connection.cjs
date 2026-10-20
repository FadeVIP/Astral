'use strict';
const {queryStatus}=require('./server-status.cjs');
function serverConnection(config,query=queryStatus){
 let cached,pending;
 async function check(){
  if(cached&&Date.now()-cached.time<10000)return cached;
  if(!pending)pending=(async()=>{
   const primary={...config,statusTimeoutMs:3500};let status=await query(primary),endpoint=primary;
   if(status.state==='unreachable'){
    for(const host of config.localHosts||[]){
     const candidate={...config,host,statusTimeoutMs:2000};const local=await query(candidate);
     if(local.state==='online'||local.state==='offline'){status=local;endpoint=candidate;break}
    }
   }
   return cached={status,endpoint,time:Date.now()};
  })().finally(()=>{pending=null});
  return pending;
 }
 return {async status(){return (await check()).status},async endpoint(){const value=await check();if(value.status.state!=='online')throw Error(value.status.state==='untrusted'?'Сертификат сервера Astral не совпадает.':'Сервер Astral недоступен. Проверьте соединение и повторите запуск.');return value.endpoint}};
}
module.exports={serverConnection};
