const test=require('node:test'),assert=require('node:assert/strict');
const {document}=require('../../public-data.cjs');
const {snapshot}=require('../src/public-data.cjs');
test('public snapshots exclude account credentials and balances',()=>{const doc=document('cosmetics','hat-one',{name:'Hat',price:10,enabled:true,uid:'private',token:'secret',balance:100});assert.deepEqual(Object.keys(doc.fields),['name','price','enabled']);assert.throws(()=>document('accounts','user',{}));});
test('empty authoritative public snapshot never resurrects bundled items',async()=>{const d=await snapshot('cosmetics',async()=>Response.json({version:1,count:0,source:'firestore',updatedAt:10}));assert.deepEqual(d.documents,[]);assert.equal(d.source,'firestore');});
test('public catalog works while Firestore is unavailable and never sends credentials',async()=>{const d=await snapshot('packs',async(url,options)=>{assert.match(url,/publicLauncherData\/packs.json$/);assert.equal(options.headers,undefined);return Response.json({version:1,count:1,documents:[{name:'pack-test',fields:{}}]});});assert.equal(d.documents.length,1);});
test('normal launcher catalog reads only public snapshots, admin catalog stays direct',async t=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');const {CatalogService}=require('../src/catalog.cjs');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'astral-public-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const packs=require('../assets/public-data/packs.json'),style=require('../assets/public-data/appearance.json');let urls=[];
 const c=new CatalogService({publicData:true,projectId:'test'}, {}, dir,async url=>{urls.push(url);assert.match(url,/publicLauncherData/);return Response.json({...url.includes('/packs.json')?packs:style,source:'firestore'});});
 await c.load();assert.equal(c.packs.length,packs.documents.length);assert.equal(urls.length,2);assert.equal(c.online,true);
});
