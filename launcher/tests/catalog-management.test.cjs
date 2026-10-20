'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {CatalogService,draft,appearance,encode}=require('../src/catalog.cjs');
const {uninstallTarget}=require('../src/uninstall.cjs');const builtin=require('../pack.json');
test('Server visibility is optional, strictly boolean and preserved by draft/appearance',()=>{
 const data={name:'Local',version:'1',description:'',minecraft:'1.20.1',forge:'47.4.20',driveUrl:`https://drive.google.com/file/d/${builtin.driveFileId}/view`,cover:'forest',showServer:false};
 assert.equal(draft(data).showServer,false);assert.equal(appearance({name:'Local',description:'',cover:'forest',showServer:false}).showServer,false);
 assert.throws(()=>draft({...data,showServer:'false'}));assert.throws(()=>appearance({name:'Local',cover:'forest',showServer:0}));
});
test('Catalog deletion requires fresh admin rights and matching revision with server precondition',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'astral-remove-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 let admin=false,deleted=false;const auth={session:{uid:'u',idToken:'test'},publicUser:()=>({status:'active'}),refresh:async()=>{},requireAccess:async()=>{}};
 const catalog=new CatalogService(builtin.firebase,auth,dir,async(url,options)=>{
  if(url.includes('/launcherAdmins/'))return Response.json({fields:encode({enabled:admin}).mapValue.fields});
  if(url.includes('pageSize='))return Response.json({documents:[]});
  if(options.method==='DELETE'){assert.equal(new URL(url).searchParams.get('currentDocument.updateTime'),'server-revision');deleted=true;return Response.json({});}
  if(url.includes('/launcherAppearance/'))return Response.json({},{status:404});
  return Response.json({fields:encode({updatedAt:'revision'}).mapValue.fields,updateTime:'server-revision'});
 });
 await assert.rejects(catalog.remove('pack-test','revision'));assert.equal(deleted,false);admin=true;
 await assert.rejects(catalog.remove('pack-test','old'),/изменили/);await assert.rejects(catalog.remove('astral','revision'));assert.equal(deleted,false);
 await catalog.remove('pack-test','revision');assert.equal(deleted,true);
});
test('Uninstall is confined to a real direct instance directory and rejects junctions',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'astral-uninstall-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const instance=path.join(root,'instances','astral-abcdef123456');await fs.mkdir(instance,{recursive:true});await fs.writeFile(path.join(instance,'world.txt'),'preserve');
 assert.equal(await uninstallTarget({root,instance}),instance);assert.equal(await fs.readFile(path.join(instance,'world.txt'),'utf8'),'preserve');
 await assert.rejects(uninstallTarget({root,instance:root}));await assert.rejects(uninstallTarget({root,instance:path.join(instance,'saves')}));
 const link=path.join(root,'instances','astral-123456abcdef');await fs.symlink(instance,link,process.platform==='win32'?'junction':'dir');await assert.rejects(uninstallTarget({root,instance:link}),/ссылке/);
 assert.equal(await uninstallTarget({root,instance:path.join(root,'instances','astral-000000000000')}),null);
});
