const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {FILES,repair,owns}=require('../src/minepass-mods.cjs');
test('MinePass pair installs, repairs corruption and backs up duplicate versions without touching progress',async()=>{
 const instance=await fs.mkdtemp(path.join(os.tmpdir(),'astral-pass-'));
 try {
  const gameDirectory=path.join(instance,'minecraft'),mods=path.join(gameDirectory,'mods');
  const installer={instance,gameDirectory,pack:{id:'astral',minecraft:'1.20.1',forge:'47.4.20'},report(){}};
  await fs.mkdir(mods,{recursive:true});
  await fs.writeFile(path.join(mods,'astral-minepass-0.2.5.jar'),'old-core');
  await fs.writeFile(path.join(mods,'astral-minepass-ui-0.3.2.jar'),'old-ui');
  await fs.writeFile(path.join(mods,'other-mod.jar'),'keep');
  await fs.mkdir(path.join(gameDirectory,'saves/world/data'),{recursive:true});
  const progress=path.join(gameDirectory,'saves/world/data/minepass.dat');
  await fs.writeFile(progress,'quest-progress');
  assert.deepEqual(await repair(installer),{checked:2,repaired:2,removed:2});
  assert.deepEqual((await fs.readdir(mods)).sort(),[...FILES,'other-mod.jar'].sort());
  assert.equal((await fs.readdir(path.join(instance,'.minepass-backups'))).length,2);
  assert.deepEqual(await repair(installer),{checked:2,repaired:0,removed:0});
  await fs.writeFile(path.join(mods,FILES[0]),'damaged');
  assert.equal((await repair(installer)).repaired,1);
  assert.equal(await fs.readFile(progress,'utf8'),'quest-progress');
  assert.equal(await fs.readFile(path.join(mods,'other-mod.jar'),'utf8'),'keep');
  assert.deepEqual(await repair({...installer,pack:{...installer.pack,id:'other'}}),{checked:0,repaired:0,removed:0});
  assert.deepEqual(await repair({...installer,pack:{...installer.pack,minecraft:'1.7.10'}}),{checked:0,repaired:0,removed:0});
  assert.equal(owns('mods/astral-minepass-0.2.5.jar'),true);
  assert.equal(owns('mods/astral-minepass-ui-0.3.3.jar'),true);
  assert.equal(owns('saves/astral-minepass-0.2.5.jar'),false);
  assert.equal(owns('mods/other-mod.jar'),false);
 } finally {await fs.rm(instance,{recursive:true,force:true});}
});
