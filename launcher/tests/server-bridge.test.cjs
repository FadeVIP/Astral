'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {pinServer}=require('../src/server-bridge.cjs');
const {unpinAstralServer}=require('../src/server-bridge.cjs');
const {removePinnedServer}=require('../src/server-bridge.cjs');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');

test('Minecraft empty TAG_End server list is valid and needs no migration',()=>{
 const empty=Buffer.from('0a000009000773657276657273000000000000','hex');
 assert.strictEqual(unpinAstralServer(empty),empty);
 assert.deepEqual(pinServer(empty,25564),pinServer(null,25564));
 const compoundEmpty=Buffer.from(empty);compoundEmpty[13]=10;
 assert.strictEqual(unpinAstralServer(compoundEmpty),compoundEmpty);
 const invalid=Buffer.from(empty);invalid.writeInt32BE(1,14);
 assert.throws(()=>unpinAstralServer(invalid));
});

test('launch migration leaves empty and unreadable server files intact',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'astral-servers-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'servers.dat');
 await removePinnedServer(dir);
 const empty=Buffer.from('0a000009000773657276657273000000000000','hex');
 for(const bytes of [empty,Buffer.alloc(0),Buffer.from('invalid'),empty.subarray(0,15)]){
  await fs.writeFile(file,bytes);const warnings=[];
  await removePinnedServer(dir,message=>warnings.push(message));
  assert.deepEqual(await fs.readFile(file),bytes);
  assert.equal(warnings.length,bytes===empty?0:1);
  assert.deepEqual(await fs.readdir(dir),['servers.dat']);
 }
 const own=pinServer(null,25564),both=pinServer(own,null,{name:'Friends',address:'192.168.1.2:25565'});
 await fs.writeFile(file,both);await removePinnedServer(dir);
 assert.deepEqual(await fs.readFile(file+'.astral-disabled-backup'),both);
 const updated=await fs.readFile(file);assert(updated.includes(Buffer.from('Friends')));assert(!updated.includes(Buffer.from('127.0.0.1:25564')));
});
test('disabling Astral removes only its pinned entry and preserves other saved servers',()=>{
 const own=pinServer(null,25564),both=pinServer(own,null,{name:'My LAN world',address:'192.168.1.10:25565'});
 const removed=unpinAstralServer(both);assert(!removed.includes(Buffer.from('127.0.0.1:25564')));assert(removed.includes(Buffer.from('My LAN world')));assert(removed.includes(Buffer.from('192.168.1.10:25565')));assert.deepEqual(unpinAstralServer(removed),removed);
});
test('Astral is inserted and remains single when pinning repeatedly',()=>{
 const first=pinServer(null,25564);assert(first.includes(Buffer.from('127.0.0.1:25564')));
 assert.deepEqual(pinServer(first,25564),first);
});
test('Malformed server list is rejected rather than silently overwriting it',()=>{
 assert.throws(()=>pinServer(Buffer.from('invalid'),25564));
 assert.throws(()=>pinServer(Buffer.from([10,0,0,9,0,7,115]),25564));
});
