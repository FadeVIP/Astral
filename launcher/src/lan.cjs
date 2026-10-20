'use strict';
const path=require('node:path');
const fs=require('node:fs'),crypto=require('node:crypto');
const {supported}=require('./client-features.cjs');
function enabled(settings,pack){return supported(pack)&&settings.lanLocalProfiles?.[pack.id||'astral']!==false;}
function agentFile(installer){
 const data=fs.readFileSync(path.join(__dirname,'../assets/astral-lan-agent.jar'));
 const hash=crypto.createHash('sha256').update(data).digest('hex');
 const target=path.join(installer.root,'launcher-runtime','lan',hash,'astral-lan-agent.jar');
 if(!fs.existsSync(target)||!fs.readFileSync(target).equals(data)){
  fs.mkdirSync(path.dirname(target),{recursive:true});
  const temp=target+'.'+process.pid+'.tmp';
  try{fs.writeFileSync(temp,data);fs.renameSync(temp,target);}finally{fs.rmSync(temp,{force:true});}
 }
 return target;
}
function args(installer){return installer.allowLanLocalProfiles!==false&&supported(installer.pack)?[
  '--add-exports=java.base/jdk.internal.org.objectweb.asm=ALL-UNNAMED',
  '-javaagent:'+agentFile(installer)
]:[];}
module.exports={supported,enabled,args};
