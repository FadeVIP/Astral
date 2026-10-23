'use strict';
// Only public appearance and published game settings leave Firestore here.
const allow={skins:['png','model'],outfits:['cape','wings','hat','halo','aura'],minepass:['revision','config']};
const {encode}=require('./public-data.cjs');
function project(kind,data){const fields={};for(const key of allow[kind]||[])if(data[key]!==undefined)fields[key]=encode(data[key]);return {fields};}
function start(admin,db){
 const state={};if(!db)return state;
 for(const [kind,collection] of [['skins','accountSkins'],['outfits','accountCosmetics'],['minepass','minepassConfig']]){
  let unsubscribe,timer;
  const write=require('./mirror-writer.cjs').writer(db.ref('publicGameData/'+kind),value=>{state[kind]=value;});
  function watch(){
   state[kind]='connecting';
   unsubscribe=admin.firestore().collection(collection).onSnapshot(snapshot=>{
    const rows=Object.fromEntries(snapshot.docs.filter(d=>/^[a-zA-Z0-9_-]{1,64}$/.test(d.id)).map(d=>[d.id,project(kind,d.data())]));
    write(rows);
   },()=>{state[kind]='cached';unsubscribe?.();clearTimeout(timer);timer=setTimeout(watch,1800000);timer.unref();});
  }watch();
 }
 return state;
}
module.exports={start,project};
