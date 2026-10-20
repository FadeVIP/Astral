const fs=require('fs'),path=require('path');const {client,project}=require('./firebase-admin.cjs');const {encode}=require('../src/catalog.cjs');
(async()=>{const api=await client(),url=`https://firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore`,release=(await api.request({url})).data,old=(await api.request({url:'https://firebaserules.googleapis.com/v1/'+release.rulesetName})).data;
const block=fs.readFileSync(path.join(__dirname,'cosmetics-rules.txt'),'utf8'),text=old.source.files[0].content;
const check=JSON.parse(fs.readFileSync(path.join(__dirname,'../artifacts/cosmetics-emulator-result.json')));if(!check.passed||check.rulesSha256!==require('crypto').createHash('sha256').update(block).digest('hex'))throw Error('Rules must pass isolated tests before publication');
if(!text.includes(block.trim())){
 if(text.includes('function cosmeticPurchase'))throw Error('Cosmetics rules already exist but differ. Review before replacement.');
 if(!text.includes('    match /{document=**}'))throw Error('Unexpected rules');
 fs.writeFileSync(path.join(__dirname,'../artifacts/cosmetics-rules-before.json'),JSON.stringify({release,old}));
 const next=text.replace('    match /{document=**}',()=>block+'\n    match /{document=**}');
 const created=(await api.request({url:`https://firebaserules.googleapis.com/v1/projects/${project}/rulesets`,method:'POST',data:{source:{files:[{name:'firestore.rules',content:next}]}}})).data;
 if((await api.request({url})).data.rulesetName!==release.rulesetName)throw Error('Concurrent rule change');
 await api.request({url,method:'PATCH',data:{release:{name:release.name,rulesetName:created.name},updateMask:'rulesetName'}});
 fs.writeFileSync(path.join(__dirname,'../firestore.rules'),next);console.log('COSMETICS_RULES_DEPLOYED');
}
const base=`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`,root=base.replace('https://firestore.googleapis.com/v1/',''),items=JSON.parse(fs.readFileSync(path.join(__dirname,'../../assets/cosmetics/catalog.json'))).items;
let created=0;for(const {id,...item} of items){try{await api.request({url:base+'/cosmeticCatalog/'+id});}catch(e){if(e.response?.status!==404)throw e;await api.request({url:base+':commit',method:'POST',data:{writes:[{update:{name:root+'/cosmeticCatalog/'+id,fields:encode(item).mapValue.fields},currentDocument:{exists:false}}]}});created++;}}
console.log('CATALOG_READY created='+created+' total='+items.length);
})().catch(e=>{console.error(JSON.stringify(e.response?.data?.error||{message:e.message}));process.exitCode=1});
