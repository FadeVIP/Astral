'use strict';
const fields={
 packs:['name','version','description','minecraft','forge','driveFileId','cover','coverImage','published','serverAddress','showServer','archiveBytes','modCount','sha256','archivePrefix','java','forgeInstaller','updatedAt'],
 appearance:['name','description','cover','coverImage','showServer','updatedAt'],
 cosmetics:['name','kind','design','color','price','enabled','rarity']
};
function encode(value){if(typeof value==='string')return {stringValue:value};if(typeof value==='boolean')return {booleanValue:value};if(Number.isSafeInteger(value))return {integerValue:String(value)};if(value&&typeof value==='object'&&!Array.isArray(value))return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]))}};throw Error('Unsupported public field');}
function document(kind,id,data){if(!fields[kind]||!/^[-a-z0-9]{1,64}$/.test(id))throw Error('Invalid public record');const safe={};for(const key of fields[kind])if(data[key]!==undefined&&data[key]!==null)safe[key]=encode(data[key]);return {name:id,fields:safe};}
function start(admin,db){
 const state={sources:{}};if(!db)return state;
 const definitions=[['packs','launcherPacks'],['appearance','launcherAppearance/astral'],['cosmetics','cosmeticCatalog']];
 for(const [kind,source] of definitions){let retry,unsubscribe,chain=Promise.resolve();
  function watch(){state.sources[kind]={status:"connecting"};
   const ref=kind==='appearance'?admin.firestore().doc(source):admin.firestore().collection(source);
   unsubscribe=ref.onSnapshot(snapshot=>{chain=chain.then(async()=>{
    const rows=kind==='appearance'?(snapshot.exists?[snapshot]:[]):snapshot.docs;
    const documents=rows.filter(d=>kind!=='packs'||d.data().published===true).map(d=>document(kind,d.id,d.data()));
    await db.ref('publicLauncherData/'+kind).set({version:1,updatedAt:Date.now(),source:'firestore',count:documents.length,documents});state.sources[kind]={status:'live',count:documents.length,updatedAt:Date.now()};
   }).catch(()=>console.error('[Public data] snapshot update failed:',kind));},()=>{state.sources[kind]={status:"cached",retryMinutes:30};unsubscribe?.();clearTimeout(retry);retry=setTimeout(watch,30*60*1000);retry.unref();console.error('[Public data] source unavailable; retained last snapshot:',kind);});
  }watch();
 }
 return state;
}
module.exports={start,document,encode};
