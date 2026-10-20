const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {repair,FILE}=require('../src/atmosphere.cjs');
test('main pack theme restores missing/corrupt JAR, backs up old bytes and leaves saves intact',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'astral-theme-'));
 try{const installer={instance:root,gameDirectory:path.join(root,'minecraft'),pack:{id:'astral',minecraft:'1.20.1',forge:'47.4.20'},report(){}};
 const target=path.join(installer.gameDirectory,FILE),save=path.join(installer.gameDirectory,'saves/keep.dat');await fs.mkdir(path.dirname(save),{recursive:true});await fs.writeFile(save,'world');
 assert.equal((await repair(installer)).repaired,1);assert.equal((await repair(installer)).repaired,0);
 await fs.writeFile(target,'old theme');assert.equal((await repair(installer)).repaired,1);assert.equal((await fs.readdir(path.join(root,'.atmosphere-backups'))).length,1);assert.equal(await fs.readFile(save,'utf8'),'world');
 assert.deepEqual(await repair({...installer,pack:{...installer.pack,id:'new-pack'}}),{checked:1,repaired:0});
 assert.deepEqual(await repair({...installer,pack:{...installer.pack,forge:'47.4.23'}}),{checked:1,repaired:0});
 assert.deepEqual(await repair({...installer,pack:{...installer.pack,minecraft:'1.7.10'}}),{checked:0,repaired:0});
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
