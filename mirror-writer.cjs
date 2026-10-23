'use strict';
// Retry the latest snapshot without rereading Firestore; coalesce bursts.
function writer(ref,onState=()=>{}){
 let latest,revision=0,saved=0,busy=false,timer,delay=15000;
 async function flush(){
  if(busy||saved===revision)return;busy=true;const current=revision,value=latest;
  try{await ref.set(value);saved=current;delay=15000;onState('live');}
  catch{onState('cached');timer=setTimeout(flush,delay);timer.unref?.();delay=Math.min(delay*2,300000);}
  finally{busy=false;if(saved===current&&saved!==revision)flush();}
 }
 return value=>{latest=value;revision++;clearTimeout(timer);flush();};
}
module.exports={writer};
