const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const {launchGame}=require('../src/game.cjs');
test('first custom-pack launch creates missing runtime ancestors before MCLC runs',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'astral-runtime-'));
 const root=path.join(temp,'Games','Astral');
 const installer={root,gameDirectory:path.join(root,'instances','custom','minecraft'),pack:{id:'custom',minecraft:'1.20.1',forge:'47.4.20'}};
 class Client extends EventEmitter {
  async launch(options){
   assert.equal(options.root,path.join(root,'minecraft-runtimes','1.20.1-47.4.20'));
   // Match MCLC's non-recursive mkdir on a fresh installation.
   if(!fs.existsSync(options.root))fs.mkdirSync(options.root);
   assert.ok(fs.statSync(options.root).isDirectory());
   return new EventEmitter();
  }
 }
 try{
  for(let i=0;i<2;i++){
   const child=await launchGame(installer,'Tester',4096,()=>{},()=>{},Client);
   child.emit('close',0);
   await new Promise(resolve=>setTimeout(resolve,30));
  }
 }finally{
  if(path.dirname(temp)!==os.tmpdir()||!path.basename(temp).startsWith('astral-runtime-'))throw Error('Unsafe cleanup path');
  fs.rmSync(temp,{recursive:true,force:true});
 }
});
