'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const FILE='mods/astral-atmosphere-0.1.0.jar';
const {supported}=require('./client-features.cjs');
async function repair(installer){
 if(!supported(installer.pack))return {checked:0,repaired:0};
 const source=await fs.readFile(path.join(__dirname,'../assets/client-mods/astral-atmosphere-0.1.0.jar'));
 const folder=path.join(installer.gameDirectory,'mods'),target=path.join(installer.gameDirectory,FILE);
 for(const p of [installer.instance,installer.gameDirectory,folder,target]){const stat=await fs.lstat(p).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(stat?.isSymbolicLink())throw Error('Файл оформления или его папка не должны быть ссылкой.');}
 const previous=await fs.readFile(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(previous?.equals(source))return {checked:1,repaired:0};
 if(previous){const backup=path.join(installer.instance,'.atmosphere-backups',crypto.createHash('sha256').update(previous).digest('hex')+'.jar');await fs.mkdir(path.dirname(backup),{recursive:true});await fs.writeFile(backup,previous);}
 await fs.mkdir(folder,{recursive:true});
 const temp=target+'.'+crypto.randomUUID()+'.tmp';
 try{await fs.writeFile(temp,source);await fs.rename(temp,target);}finally{await fs.rm(temp,{force:true});}
 installer.report('verify','Оформление Astral проверено и обновлено.');
 return {checked:1,repaired:1};
}
module.exports={FILE,supported,repair};
