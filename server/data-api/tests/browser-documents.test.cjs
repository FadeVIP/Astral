const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function adapter(request){
 const source=fs.readFileSync(path.resolve(__dirname,'../../../sql-documents.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export ','');
 const context=vm.createContext({URLSearchParams,root:'projects/test/databases/(default)/documents',apiFor:()=>request,getAuth:()=>({})});
 vm.runInContext(source+';globalThis.api={getFirestore,doc,collection,getDoc,getDocs,query,limit,startAfter,setDoc,serverTimestamp,runTransaction};',context);
 return context.api;
}
test('browser adapter paginates without repeating the final page and decodes timestamps',async()=>{
 const calls=[];
 const a=adapter(async url=>{calls.push(url);return {documents:[{name:'projects/test/databases/(default)/documents/siteStarFinders/alice',fields:{foundAt:{timestampValue:'2026-10-24T00:00:00Z'}}}]};});
 const db=a.getFirestore(),ref=a.collection(db,'siteStarFinders');
 const first=await a.getDocs(a.query(ref,a.limit(50)));
 assert.equal(first.docs[0].ref.path,'siteStarFinders/alice');
 assert.equal(first.docs[0].data().foundAt.toDate().toISOString(),'2026-10-24T00:00:00.000Z');
 assert.equal((await a.getDocs(a.query(ref,a.startAfter(first.docs[0])))).size,0);
 assert.equal(calls.length,1);
});
test('browser adapter preserves conditional admin writes and server timestamps',async()=>{
 const calls=[];
 const a=adapter(async(url,method,data)=>{calls.push({url,method,data});return url===':commit'?{}:{fields:{revision:{integerValue:'4'}},updateTime:'2026-10-24T00:00:00.123456789Z'};});
 const db=a.getFirestore(),ref=a.doc(db,'minepassConfig','astral-local');
 await a.runTransaction(db,async t=>{const current=await t.get(ref);t.set(ref,{revision:current.data().revision+1,updatedAt:a.serverTimestamp()});});
 const w=calls[1].data.writes[0];
 assert.equal(w.currentDocument.updateTime,'2026-10-24T00:00:00.123456789Z');
 assert.equal(w.update.fields.revision.integerValue,'5');
 assert.equal(w.updateTransforms[0].setToServerValue,'REQUEST_TIME');
});
