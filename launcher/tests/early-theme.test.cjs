const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {launchOptions}=require('../src/game.cjs');
test('early theme is scoped to supported Astral Forge and an installed atmosphere module',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'astral-early-'));
 try {
  const installer={allowLanLocalProfiles:false,root:dir,gameDirectory:dir,pack:{id:'astral',minecraft:'1.20.1',forge:'47.4.20'}};
  assert.equal(launchOptions({...installer,allowLanLocalProfiles:false},'Tester',4096).customArgs,undefined);
  fs.mkdirSync(path.join(dir,'mods'));const jar=path.join(dir,'mods/astral-atmosphere-0.1.0.jar');fs.writeFileSync(jar,'test');
  assert.deepEqual(launchOptions(installer,'Tester',4096).customArgs,['-javaagent:'+jar]);
  assert.deepEqual(launchOptions({...installer,pack:{...installer.pack,id:'new-pack',forge:'47.4.23'}},'Tester',4096).customArgs,['-Dastral.integrationOnly=true']);
  for(const change of [{forge:'47.4.21'},{minecraft:'1.7.10'}])assert.equal(launchOptions({...installer,allowLanLocalProfiles:false,pack:{...installer.pack,...change}},'Tester',4096).customArgs,undefined);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
