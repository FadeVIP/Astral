'use strict';
const path=require('node:path');
const {readJSON,atomicJSON}=require('./install.cjs');
async function syncMinePass(directory,fetcher=fetch){
 const url='https://829504-vds-korolevikh2001vlad.gmhost.pp.ua/api/v1/realtime/publicGameData/minepass/astral-local.json';
 const response=await fetcher(url,{signal:AbortSignal.timeout(8000)});
 if(response.status===404)return false;
 if(!response.ok)throw Error('MinePass: настройки временно недоступны');
 const text=await response.text();if(text.length>700000)throw Error('MinePass: слишком большой ответ');
 const fields=JSON.parse(text).fields,revision=Number(fields?.revision?.integerValue),config=JSON.parse(fields?.config?.stringValue||'null');
 if(!Number.isSafeInteger(revision)||revision<1||config?.schema!==1||config.season!=='astral-s1'||!Array.isArray(config.quests)||!config.chests)throw Error('MinePass: неверный формат настроек');
 const file=path.join(directory,'config','astral-minepass','published.json'),old=await readJSON(file,{});
 if((old.revision||0)>=revision)return false;
 await atomicJSON(file,{revision,config});return true;
}
function followMinePass(directory,onError=()=>{}){
 let busy=false,closed=false;
 const poll=async()=>{if(busy||closed)return;busy=true;try{await syncMinePass(directory);}catch(e){onError(e);}finally{busy=false;}};
 const timer=setInterval(poll,30000);timer.unref();poll();return()=>{closed=true;clearInterval(timer);};
}
module.exports={syncMinePass,followMinePass};
