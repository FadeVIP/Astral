'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const crypto=require('node:crypto');
const {CatalogService,driveId,draft,normalize,encode,decode}=require('../src/catalog.cjs');
const {PackAnalyzer,inspectGame}=require('../src/catalog-analyze.cjs');
const {repairCatalog}=require('../src/catalog-repair.cjs');
const {Installer,atomicJSON}=require('../src/install.cjs');
const {extractZip}=require('../src/archive.cjs');const {launchOptions}=require('../src/game.cjs');
const {zipFixture}=require('./zip-fixture.cjs');const builtin=require('../pack.json');
const input={name:'Test pack',version:'1.0',description:'Custom pack',minecraft:'1.20.1',forge:'47.4.20',driveUrl:'https://drive.google.com/file/d/'+builtin.driveFileId+'/view',cover:'forest'};
const pack=normalize('pack-test',{...builtin,...draft(input),archivePrefix:'',updatedAt:'2026-09-15T12:00:00.000Z'});
async function temp(t){const d=await fs.mkdtemp(path.join(os.tmpdir(),'astral-catalog-'));t.after(()=>fs.rm(d,{recursive:true,force:true}));return d;}
test('Catalog accepts Drive files and rejects folders, credential URLs, paths and executable origins',()=>{
 assert.equal(driveId(input.driveUrl),builtin.driveFileId);
 for(const link of ['https://drive.google.com/drive/folders/123','https://drive.google.com.evil/file/d/abcdefghijk','http://drive.google.com/file/d/abcdefghijk','https://u:p@drive.google.com/file/d/abcdefghijk'])assert.throws(()=>driveId(link));
 for(const change of [{id:'../bad'},{java:{...pack.java,folder:'../escape'}},{java:{...pack.java,url:'https://github.com/attacker/evil/releases/download/a/a.zip'}},{forgeInstaller:{...pack.forgeInstaller,url:'https://example.com/forge.jar'}},{archivePrefix:'../'},{minecraft:'../../'},{serverAddress:'example.com:99999'},{sha256:'bad'}])assert.throws(()=>normalize(change.id||pack.id,{...pack,...change}));
 assert.deepEqual(decode(encode(pack)),pack);assert.equal(normalize('astral',pack).id,'astral');
});
test('Different Forge builds use separate game caches and instances; original Astral identity stays stable',()=>{
 const first=new Installer('C:/test',{...pack});const second=new Installer('C:/test',{...pack,forge:'47.4.21'});
 assert.notEqual(first.instance,second.instance);assert.notEqual(launchOptions(first,'Tester',4096).root,launchOptions(second,'Tester',4096).root);
 const original=new Installer('C:/test',builtin), originalWithId=new Installer('C:/test',{...builtin,id:'astral'});
 assert.equal(original.instance,originalWithId.instance);assert.equal(launchOptions(original,'Tester',4096).root,launchOptions(originalWithId,'Tester',4096).root);
 assert.notEqual(first.instance,new Installer('C:/test',{...pack,sha256:'a'.repeat(64)}).instance);
 assert.equal(original.instance,new Installer('C:/test',{...builtin,version:'Renamed release',name:'New name'}).instance);
 for(const change of [{minecraft:'1.21.1'},{forge:'47.4.21'},{sha256:'a'.repeat(64)}])assert.notEqual(original.instance,new Installer('C:/test',{...builtin,id:'astral',...change}).instance);
 const content=new (require('../src/content-update.cjs').ContentService)({},'unused',()=>{}),main={...builtin,id:'astral'};
 assert.equal(content.key(main),'astral-'+builtin.sha256.slice(0,16));
 assert.notEqual(content.key(main),content.key({...main,forge:'47.4.21'}));
});

test('Custom covers are bounded JPEG data, can be replaced or removed without rechecking the ZIP',()=>{
 const image='data:image/jpeg;base64,/9j/AAAA';
 assert.equal(draft({...input,coverImage:image}).coverImage,image);
 for(const coverImage of ['https://example.com/a.jpg','data:image/svg+xml;base64,AAAA',image+'A'.repeat(180000)])assert.throws(()=>draft({...input,coverImage}));
 const analyzer=new PackAnalyzer('unused',()=>{},builtin);
 assert.equal(analyzer.resolve(null,{...input,coverImage:image},pack).coverImage,image);
 assert.equal(analyzer.resolve(null,{...input,coverImage:''},{...pack,coverImage:image}).coverImage,undefined);
 assert.equal(new Installer('C:/test',pack).instance,new Installer('C:/test',{...pack,coverImage:image}).instance);
});
test('Archive wrapper is detected and stripped; ambiguous packs and traversal are rejected',async t=>{
 const root=await temp(t);const zip=path.join(root,'a.zip');await fs.writeFile(zip,zipFixture([['Client/.minecraft/mods/mod.jar','jar'],['Client/.minecraft/options.txt','user']]));
 const content=path.join(root,'content');await extractZip(zip,content);assert.deepEqual(await inspectGame(content),{archivePrefix:'Client/.minecraft/',modCount:1});
 const game=path.join(root,'game');await extractZip(zip,game,{prefix:'Client/.minecraft/'});assert.equal(await fs.readFile(path.join(game,'mods/mod.jar'),'utf8'),'jar');
 await fs.mkdir(path.join(content,'Other/mods'),{recursive:true});await fs.writeFile(path.join(content,'Other/mods/other.jar'),'other');await assert.rejects(inspectGame(content),/несколько/);
});
test('Publishing requires a current admin role and never sends tokens to pack hosts',async t=>{
 const directory=await temp(t);let enabled=false,signed=true,writes=0;
 const auth={session:{uid:'u1',idToken:'fixture-token'},publicUser:()=>signed?{status:'active'}:null,refresh:async()=>{},requireAccess:async()=>{if(!signed)throw Error('signed out');}};
 const catalog=new CatalogService(builtin.firebase,auth,directory,async(url,options)=>{
  assert.ok(url.startsWith('https://firestore.googleapis.com/'));if(url.includes('launcherAdmins/'))return Response.json({fields:encode({enabled}).mapValue.fields});
  if(url.includes('pageSize='))return Response.json({documents:[]});
  if(options.method==='PATCH'){writes++;return Response.json({});}return Response.json({}, {status:404});
 });
 await assert.rejects(catalog.publish(null,pack),/администратору/);assert.equal(writes,0);
 enabled=true;await catalog.publish(null,pack);assert.equal(writes,1);
 enabled=false;await assert.rejects(catalog.publish(null,pack));assert.equal(writes,1);
 signed=false;assert.equal(await catalog.checkAdmin(),false);
});
test('Catalog keeps validated offline entries, filters corrupt metadata and detects stale edits',async t=>{
 const dir=await temp(t);let offline=false;const auth={session:{uid:'u',idToken:'t'},publicUser:()=>({status:'active'}),refresh:async()=>{},requireAccess:async()=>{}};
 const service=new CatalogService({...builtin.firebase,publicData:false},auth,dir,async(url)=>{
  if(offline)throw Error('offline');if(url.includes('launcherAdmins'))return Response.json({fields:encode({enabled:true}).mapValue.fields});
  const doc={name:'projects/p/databases/(default)/documents/launcherPacks/pack-test',fields:encode(pack).mapValue.fields,updateTime:'new-time'};
  return Response.json(url.includes('pageSize=')?{documents:[doc,{...doc,name:doc.name+'2',fields:encode({...pack,sha256:'bad'}).mapValue.fields}]}:doc);
 });
 await service.refresh();assert.equal(service.packs.length,1);assert.equal(service.online,true);
 await assert.rejects(service.publish('pack-test',pack,'old-edit'),/уже изменили/);
 offline=true;await service.refresh();assert.equal(service.online,false);assert.equal(service.packs.length,1);
 const restored=new CatalogService(builtin.firebase,auth,dir);await restored.restore();assert.equal(restored.packs[0].name,pack.name);
});
test('Analyzer selects Forge and Java, verifies ZIP, binds publication to checked inputs and cancels cleanly',async t=>{
 const dir=await temp(t);const fakeDownload=async opts=>{
  opts.signal.throwIfAborted();
  const zip=opts.driveFileId?zipFixture([['.minecraft/mods/a.jar','mod']]):zipFixture([['install_profile.json',JSON.stringify({minecraft:'1.20.1'})],['version.json','{}']]);
  await fs.writeFile(opts.destination,zip);return {bytes:zip.length,sha256:crypto.createHash('sha256').update(zip).digest('hex')};
 };
 const analyzer=new PackAnalyzer(dir,()=>{},builtin,{download:fakeDownload,json:async url=>url.includes('version_manifest')?{versions:[{id:'1.20.1',type:'release',url:'https://piston-meta.mojang.com/version.json'}]}:url.includes('promotions')?{promos:{'1.20.1-recommended':'47.4.20'}}:{javaVersion:{majorVersion:17}}});
 const result=await analyzer.analyze({...input,forge:''},new AbortController().signal);assert.equal(result.pack.modCount,1);assert.equal(result.pack.archivePrefix,'.minecraft/');assert.equal(result.pack.java.major,17);
 assert.equal(analyzer.resolve(result.analysisId,{...input,name:'Changed description only'},null).name,'Changed description only');
 assert.throws(()=>analyzer.resolve(result.analysisId,{...input,forge:'47.4.21'},null),/изменились/);
 assert.throws(()=>analyzer.resolve('forged-analysis',input,null));
 const controller=new AbortController();controller.abort();await assert.rejects(analyzer.analyze(input,controller.signal),{name:'AbortError'});
 assert.deepEqual(await fs.readdir(dir),[]);
});
test('Custom repair restores missing mods and preserves worlds/settings, with idempotent recheck',async t=>{
 const root=await temp(t);const zip=zipFixture([['client/mods/a.jar','original'],['client/options.txt','defaults']]);const archive=path.join(root,'pack.zip');await fs.writeFile(archive,zip);
 const p={...pack,archivePrefix:'client/',archiveBytes:zip.length,sha256:crypto.createHash('sha256').update(zip).digest('hex')};const installer=new Installer(root,p);
 await fs.mkdir(path.join(installer.gameDirectory,'mods'),{recursive:true});await fs.mkdir(path.join(installer.gameDirectory,'saves/world'),{recursive:true});await fs.writeFile(path.join(installer.gameDirectory,'saves/world/test'),'keep');await fs.writeFile(path.join(installer.gameDirectory,'options.txt'),'personal');
 await atomicJSON(path.join(installer.instance,'.catalog-files.json'),[{path:'mods/a.jar',sha256:crypto.createHash('sha256').update('original').digest('hex'),bytes:8}]);installer.cachedDownload=async()=>archive;
 assert.equal((await repairCatalog(installer)).repaired,1);assert.equal((await repairCatalog(installer)).repaired,0);assert.equal(await fs.readFile(path.join(installer.gameDirectory,'options.txt'),'utf8'),'personal');assert.equal(await fs.readFile(path.join(installer.gameDirectory,'saves/world/test'),'utf8'),'keep');
});

