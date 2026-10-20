'use strict';
const {startBridge,ensurePinnedServer}=require('./server-bridge.cjs');
const {statusCache}=require('./server-status.cjs');
const PACK_ID='pack-ac98001c-fc58-4904-bf50-e7f32d24a0a0';
const config=Object.freeze({host:'91.240.175.118',port:25565,localPort:25563,fingerprint:'9f954d9624408194b293a405e3371d9e697239d2add7800afe685fb9bb16d2b4'});
function supported(pack){return pack?.id===PACK_ID&&pack.minecraft==='1.20.1'&&['47.4.20','47.4.23'].includes(pack.forge);}
async function prepare(installer,auth,deps={startBridge,ensurePinnedServer},onError=()=>{}){
 if(!supported(installer.pack))return null;
 const bridge=await deps.startBridge(config,auth,onError);
 try{await deps.ensurePinnedServer(installer.gameDirectory,bridge.port,{name:'Наследие земли — сервер Astral',address:`127.0.0.1:${bridge.port}`});return bridge;}
 catch(error){bridge.close();throw error;}
}
const status=statusCache(config);
module.exports={supported,prepare,status,config,PACK_ID};
