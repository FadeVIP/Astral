'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {redact,collect,submit}=require('../src/diagnostics.cjs');
test('diagnostics strips credentials and personal network locations',()=>{
 const input='--accessToken abcdef password=abcdef Bearer abcdef https://user:abcdef@example.com/test?token=abcdef C:\\Users\\Someone\\logs user@example.com 192.168.1.2:25565';
 const out=redact(input);for(const value of ['abcdef','Someone','user@example.com','192.168.1.2'])assert.ok(!out.includes(value),value);assert.ok(out.includes('example.com/test'));
});
test('collect reads only bounded launcher and Minecraft logs',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'astral-report-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'logs'));await fs.mkdir(path.join(root,'game/logs'),{recursive:true});
 await fs.writeFile(path.join(root,'logs/latest-launch.log'),'x'.repeat(30000)+' password=HIDDEN');await fs.writeFile(path.join(root,'game/logs/latest.log'),'game tail');await fs.writeFile(path.join(root,'auth.json'),'SHOULD_NOT_COLLECT');
 const d=await collect({root,gameDirectory:path.join(root,'game'),pack:{minecraft:'1.20.1',forge:'47.4.20',name:'Test'}},'0.5.1',6144);assert.ok(d.text.length<21000);assert.ok(d.text.includes('game tail'));assert.ok(!d.text.includes('HIDDEN'));assert.ok(!d.text.includes('SHOULD_NOT_COLLECT'));
});
test('reports are private, chunked and retry without duplicate messages',async()=>{
 const docs=new Map(),commits=[];const catalog={base:'https://firestore.googleapis.com/v1/projects/test/databases/(default)/documents',auth:{requireAccess:async()=>{},session:{uid:'u',idToken:'t'},publicUser:()=>({nickname:'Player'})},request:async(route,opt)=>{if(route===':commit'){commits.push(opt.body.writes);for(const w of opt.body.writes)docs.set(w.update.name.split('/documents')[1],w.update);return {};}if(opt.method==='PATCH'){docs.set(route.split('?')[0],opt.body);return {};}return docs.get(route)||null;}};
 const draft={id:'report',createdAt:Date.now(),text:'a'.repeat(5200)};await submit(catalog,draft,'Ошибка');await submit(catalog,draft,'Ошибка');assert.equal(commits.length,1);assert.equal(commits[0].length,3);for(const w of commits[0]){assert.ok(w.update.fields.text.stringValue.length<=2400);assert.equal(w.update.fields.uid.stringValue,'u');assert.equal(w.update.fields.admin.booleanValue,false);}
});
