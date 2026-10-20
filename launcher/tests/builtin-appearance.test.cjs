'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {CatalogService,appearance,encode}=require('../src/catalog.cjs');
const {Installer}=require('../src/install.cjs');
const builtin=require('../pack.json');
const style={name:'Astral',description:'Новый мир',cover:'forest',coverImage:'data:image/jpeg;base64,/9j/AAAA'};
test('Main pack appearance cannot alter runtime, archive, server or installation identity',()=>{
 for(const field of ['id','version','minecraft','forge','driveFileId','sha256','server','java','published'])assert.throws(()=>appearance({...style,[field]:'changed'}));
 const original=new Installer('C:/test',builtin),edited=new Installer('C:/test',{...builtin,...appearance(style)});
 assert.equal(original.instance,edited.instance);assert.equal(original.javaPath,edited.javaPath);
 for(const coverImage of ['https://bad/image.jpg','data:image/svg+xml;base64,AAAA','x'.repeat(180001)])assert.throws(()=>appearance({...style,coverImage}));
});
test('Main appearance requires admin, rejects stale writes and restores validated offline style',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'appearance-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 let enabled=false,doc=null,offline=false,writes=0;
 const auth={session:{uid:'test',idToken:'test'},publicUser:()=>({status:'active'}),refresh:async()=>{},requireAccess:async()=>{}};
 const service=new CatalogService(builtin.firebase,auth,dir,async(url,opts)=>{
  if(offline)throw Error('offline');
  if(url.includes('launcherAdmins'))return Response.json({fields:encode({enabled}).mapValue.fields});
  if(url.includes('launcherPacks'))return Response.json({documents:[]});
  if(opts.method==='PATCH'){writes++;doc={fields:JSON.parse(opts.body).fields,updateTime:'server-time'};return Response.json(doc);}
  return doc?Response.json(doc):Response.json({},{status:404});
 });
 await assert.rejects(service.publishAppearance(style),/администратору/);assert.equal(writes,0);
 enabled=true;const saved=await service.publishAppearance(style);assert.equal(writes,1);
 await assert.rejects(service.publishAppearance(style,'old'),/уже изменили/);assert.equal(writes,1);
 offline=true;await service.refresh();assert.equal(service.builtinAppearance.coverImage,style.coverImage);
 const restored=new CatalogService(builtin.firebase,auth,dir);await restored.restore();assert.equal(restored.builtinAppearance.updatedAt,saved.updatedAt);
 offline=false;await service.publishAppearance({...style,coverImage:''},saved.updatedAt);assert.equal(service.builtinAppearance.coverImage,undefined);
});
