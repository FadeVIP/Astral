'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {validate,validPath,ContentService,applyContent,recoverContent,rollbackContent}=require('../src/content-update.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const pack={id:'astral',sha256:'a'.repeat(64),minecraft:'1.20.1',forge:'47.4.20',version:'1'};
const manifest=()=>({schema:1,packId:pack.id,baseSha256:pack.sha256,minecraft:pack.minecraft,forge:pack.forge,revision:1,version:'1.1',files:[{path:'config/new.json',driveFileId:'test-file-123456',sha256:hash('new'),bytes:3}],remove:['mods/old.jar']});
test('content updates reject saves, traversal, executables, collisions and wrong base',()=>{
 for(const p of ['saves/world/level.dat','mods/../secrets','mods/CON.jar','mods/a:stream','mods/tool.exe','mods/ab?.jar'])assert.throws(()=>validPath(p));
 assert.throws(()=>validate({...manifest(),baseSha256:'b'.repeat(64)},pack));
 assert.throws(()=>validate({...manifest(),remove:['CONFIG/new.json']},pack));
 assert.throws(()=>validate({...manifest(),files:[...manifest().files,...manifest().files]},pack));
});
test('verified additions/removals preserve worlds and backup old files; failed downloads change nothing',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'astral-content-'));try{
  const gameDirectory=path.join(root,'minecraft');await fs.mkdir(path.join(gameDirectory,'mods'),{recursive:true});await fs.mkdir(path.join(gameDirectory,'saves/world'),{recursive:true});await fs.writeFile(path.join(gameDirectory,'mods/old.jar'),'old');await fs.writeFile(path.join(gameDirectory,'saves/world/level.dat'),'world');
  const installer={instance:root,gameDirectory,pack,report(){}};
  await assert.rejects(applyContent(installer,manifest(),{downloader:async()=>{throw Error('network');}}));
  assert.equal(await fs.readFile(path.join(gameDirectory,'mods/old.jar'),'utf8'),'old');
  const result=await applyContent(installer,manifest(),{downloader:async({destination})=>{await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,'new');}});
  assert.equal(result.repaired,1);assert.equal(result.removed,1);assert.equal(await fs.readFile(path.join(gameDirectory,'saves/world/level.dat'),'utf8'),'world');
  const backups=await fs.readdir(path.join(root,'.content-backups'));assert.equal(await fs.readFile(path.join(root,'.content-backups',backups[0],'mods/old.jar'),'utf8'),'old');
  assert.equal((await applyContent(installer,manifest(),{downloader:()=>{throw Error('unexpected');}})).repaired,0);
  await rollbackContent(installer);assert.equal(await fs.readFile(path.join(gameDirectory,'mods/old.jar'),'utf8'),'old');await assert.rejects(fs.stat(path.join(gameDirectory,'config/new.json')));assert.equal(await fs.readFile(path.join(gameDirectory,'saves/world/level.dat'),'utf8'),'world');await assert.rejects(rollbackContent(installer));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('interrupted update restores backups before another update',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'astral-recover-'));try{const id=crypto.randomUUID(),gameDirectory=path.join(root,'minecraft'),saved=path.join(root,'.content-backups',id,'config/a.json');await fs.mkdir(path.dirname(saved),{recursive:true});await fs.writeFile(saved,'original');await fs.mkdir(path.join(gameDirectory,'config'),{recursive:true});await fs.writeFile(path.join(gameDirectory,'config/a.json'),'new');await fs.writeFile(path.join(root,'.content-journal.json'),JSON.stringify({id,rows:[{path:'config/a.json',existed:true}]}));await recoverContent({instance:root,gameDirectory});assert.equal(await fs.readFile(path.join(gameDirectory,'config/a.json'),'utf8'),'original');}finally{await fs.rm(root,{recursive:true,force:true});}
});
test('non-admin cannot import or publish; stale publication fails without writes',async()=>{
 const denied=new ContentService({requireAdmin:async()=>{throw Error('admin');}},os.tmpdir(),()=>{});
 await assert.rejects(denied.importFile('anything','mods/a.jar'),/admin/);
 await assert.rejects(denied.publish(pack,{},new AbortController().signal),/admin/);
 let writes=0;const service=new ContentService({requireAdmin:async()=>{},request:async()=>{writes++;}},os.tmpdir(),()=>{});service.remote=async()=>({updateTime:'new',manifest:manifest()});await assert.rejects(service.publish(pack,{previousUpdate:'old'},new AbortController().signal),/администратор/);assert.equal(writes,0);
});
test('Drive folder imports all pages and nested files; duplicate names abort',async()=>{
 let n=0;const replies=[{files:[{id:'child-folder-123',name:'nested',mimeType:'application/vnd.google-apps.folder'}],nextPageToken:'page2'},{files:[{id:'child-file-1234',name:'a.jar',mimeType:'application/java-archive'}]},{files:[{id:'second-file-1234',name:'b.jar',mimeType:'application/java-archive'}]}];
 const s=new ContentService({requireAdmin:async()=>{}},os.tmpdir(),()=>{},{fetcher:async()=>({ok:true,json:async()=>replies[n++]})});s.importFile=async(url,p)=>({path:p});const rows=await s.importFolder('https://drive.google.com/drive/folders/root-folder-123','mods','AIza'+'a'.repeat(35),new AbortController().signal);assert.deepEqual(rows.map(r=>r.path),['mods/nested/a.jar','mods/b.jar']);
});


test('published Drive deletion retains its source after reopening and can restore on another PC',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'astral-restore-source-'));
 try{
  const {encode,decode}=require('../src/catalog.cjs');let document=null,rev=0;
  const row={path:'resourcepacks/test.zip',driveFileId:'test-file-123456',sha256:hash('zip'),bytes:3};
  const catalog={requireAdmin:async()=>{},auth:{session:{idToken:'test'}},request:async(url,options={})=>{
   if(options.method==='PATCH'){document={fields:options.body.fields,updateTime:String(++rev)};return document;}return document;
  }};
  const editor=new ContentService(catalog,path.join(root,'editor'),()=>{});editor.importFile=async()=>row;
  let draft=await editor.open(pack);draft.files=[row];draft=await editor.publish(pack,draft,new AbortController().signal);
  draft.files=[];draft.remove=[row.path];draft=await editor.publish(pack,draft,new AbortController().signal);
  const other=new ContentService(catalog,path.join(root,'other-pc'),()=>{});other.importFile=async()=>row;
  draft=await other.open(pack);assert.deepEqual(draft.archivedFiles,[row]);assert.deepEqual(draft.files,[]);
  draft.files=[draft.archivedFiles[0]];draft.remove=[];draft=await other.publish(pack,draft,new AbortController().signal);
  assert.deepEqual(draft.files,[row]);assert.deepEqual(draft.archivedFiles,[]);
  const gameDirectory=path.join(root,'minecraft');await fs.mkdir(gameDirectory);const installer={instance:root,gameDirectory,pack,report(){}};
  const result=await applyContent(installer,await other.latest(pack),{downloader:async({destination})=>{await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,'zip');}});
  assert.equal(result.repaired,1);assert.equal(await fs.readFile(path.join(gameDirectory,row.path),'utf8'),'zip');
  draft.files=[];draft.remove=[row.path];draft.archivedFiles=[row];await other.save(pack,draft);
  assert.deepEqual((await new ContentService(catalog,path.join(root,'other-pc'),()=>{}).open(pack)).archivedFiles,[row]);
  assert.throws(()=>validate({...manifest(),archivedFiles:[{...row,path:'../bad'}]},pack));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});


test('root options update is backed up, applied once per content hash and preserves later player settings',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'astral-options-'));try{
  const gameDirectory=path.join(root,'minecraft');await fs.mkdir(gameDirectory);const file=path.join(gameDirectory,'options.txt');await fs.writeFile(file,'original');
  const installer={instance:root,gameDirectory,pack,report(){}};const m={...manifest(),files:[{path:'options.txt',driveFileId:'options-file-123',sha256:hash('first'),bytes:5}],remove:[]};
  const downloader=async({destination})=>fs.writeFile(destination,'first');
  assert.equal((await applyContent(installer,m,{downloader})).repaired,1);
  const backups=await fs.readdir(path.join(root,'.content-backups'));assert.equal(await fs.readFile(path.join(root,'.content-backups',backups[0],'options.txt'),'utf8'),'original');
  await fs.writeFile(file,'player changed controls');assert.equal((await applyContent(installer,{...m,revision:2},{downloader:()=>{throw Error('Should not download');}})).repaired,0);
  assert.equal(await fs.readFile(file,'utf8'),'player changed controls');
  await fs.rm(file);assert.equal((await applyContent(installer,m,{downloader})).repaired,1);
  m.files[0]={...m.files[0],sha256:hash('next'),bytes:4};assert.equal((await applyContent(installer,m,{downloader:async({destination})=>fs.writeFile(destination,'next')})).repaired,1);
  assert.equal(await fs.readFile(file,'utf8'),'next');assert.throws(()=>validate({...m,files:[],remove:['options.txt']},pack));
  for(const p of ['usercache.json','servers.dat','.astral-presence-session.json'])assert.throws(()=>validPath(p));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
