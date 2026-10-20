const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),stage=path.join(root,'launcher/runtime-agent/build');
const jdk=process.env.ASTRAL_BUILD_JDK||'C:/Program Files/Java/jdk-21.0.12.1/bin';
fs.mkdirSync(stage,{recursive:true});
function run(tool,args){const r=spawnSync(path.join(jdk,tool+'.exe'),args,{stdio:'inherit',windowsHide:true});if(r.status!==0)throw Error(tool+' failed');}
run('javac',['-source','17','-target','17','--add-exports','java.base/jdk.internal.org.objectweb.asm=ALL-UNNAMED','-d',stage,path.join(root,'launcher/runtime-agent/LanAgent.java')]);
const manifest=path.join(stage,'agent.mf');fs.writeFileSync(manifest,'Manifest-Version: 1.0\nPremain-Class: astral.runtime.LanAgent\n\n');
run('jar',['--create','--file',path.join(root,'launcher/assets/astral-lan-agent.jar'),'--manifest',manifest,'-C',stage,'astral']);
