const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {AtmosphereEditor,validate,defaults}=require('../src/atmosphere-editor.cjs');
const {encode}=require('../src/catalog.cjs');
test('appearance rejects unsafe links, hidden exit and overlapping buttons',()=>{
 assert.deepEqual(validate(defaults),defaults);
 for(const change of [c=>c.buttons[4].url='javascript:alert(1)',c=>c.buttons[4].url='https://user:secret@example.com',c=>c.buttons[3].visible=false,c=>c.buttons[1].y=c.buttons[0].y,c=>c.buttons[0].x=-1]){const c=structuredClone(defaults);change(c);assert.throws(()=>validate(c));}
});
test('admin draft publication uses concurrency check; clients restore local config and cached offline theme without touching worlds',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'astral-editor-'));let admin=true,offline=false,doc=null;
 const catalog={auth:{session:{idToken:'test'}},requireAdmin:async()=>{if(!admin)throw Error('admin only');},request:async(_,o={})=>{if(offline)throw Error('offline');if(o.method==='PATCH'){doc={fields:o.body.fields,updateTime:'revision-'+(Number(doc?.fields.revision.integerValue||0)+1)};return doc;}return doc;}};
 try{const editor=new AtmosphereEditor(catalog,path.join(dir,'editor'),async()=>Buffer.from('PNG fixture'));
 const draft=await editor.open();draft.config.buttons[0].label='В мир';await editor.save(draft);assert.equal((await editor.open()).config.buttons[0].label,'В мир');
 const published=await editor.publish(draft);assert.equal(published.revision,1);await assert.rejects(editor.publish(draft),/Другой администратор/);
 admin=false;await assert.rejects(editor.publish(published),/admin only/);await assert.rejects(editor.open(),/admin only/);
 const installer={instance:path.join(dir,'instance'),gameDirectory:path.join(dir,'instance/minecraft'),pack:{id:'astral',minecraft:'1.20.1',forge:'47.4.20'},report(){}};
 await fs.mkdir(path.join(installer.gameDirectory,'saves'),{recursive:true});const world=path.join(installer.gameDirectory,'saves/world');await fs.writeFile(world,'unchanged');
 assert.equal((await editor.apply(installer)).repaired,1);assert.equal((await editor.apply(installer)).repaired,0);
 const config=path.join(installer.gameDirectory,'config/astral-atmosphere/appearance.json');await fs.unlink(config);offline=true;assert.equal((await editor.apply(installer)).repaired,1);assert.equal(JSON.parse(await fs.readFile(config)).buttons[0].label,'В мир');assert.equal(await fs.readFile(world,'utf8'),'unchanged');
 assert.equal((await editor.apply({...installer,pack:{...installer.pack,id:'other'}})).checked,0);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
