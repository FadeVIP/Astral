'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {spawn}=require('node:child_process');
const HASH=/^[a-f0-9]{64}$/;
function isPortable(pack){return pack?.java?.version==='astra-portable-v1';}
function validPortable(pack){const j=pack.java,f=pack.forgeInstaller;return isPortable(pack)&&pack.minecraft==='1.7.10'&&pack.forge==='10.13.4.1614'&&j.major===25&&j.folder==='runtime'&&j.url==='bundle:runtime/bin/java.exe'&&f?.url==='bundle:client.jar'&&HASH.test(j.sha256)&&HASH.test(f.sha256)&&Number.isSafeInteger(j.expectedBytes)&&j.expectedBytes>0&&Number.isSafeInteger(f.expectedBytes)&&f.expectedBytes>0;}
async function inspectPortable(root,info){
 const marker=path.join(root,'astra-portable.json');let data;try{data=JSON.parse(await fs.readFile(marker,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw Error('Повреждён паспорт локальной сборки ASTRA.');}
 if(data.schema!==1||data.minecraft!=='1.7.10'||data.forge!=='10.13.4.1614'||info.minecraft!==data.minecraft||(info.forge&&info.forge!==data.forge))throw Error('Для этого архива укажите Minecraft 1.7.10 и Forge 10.13.4.1614.');
 const {hashFile}=require('./install.cjs');
 for(const file of ['AstraBootstrap.class','client.jar','runtime/bin/java.exe','assets/indexes/1.7.10.json'])if(!(await fs.stat(path.join(root,file))).isFile())throw Error('Неполная локальная сборка: '+file);
 const javaFile=path.join(root,'runtime/bin/java.exe'),client=path.join(root,'client.jar');
 return {forge:data.forge,java:{version:'astra-portable-v1',major:25,folder:'runtime',url:'bundle:runtime/bin/java.exe',sha256:await hashFile(javaFile),expectedBytes:(await fs.stat(javaFile)).size},forgeInstaller:{url:'bundle:client.jar',sha256:await hashFile(client),expectedBytes:(await fs.stat(client)).size}};
}
function args(nickname,ramMB){
 const p=require('./game.cjs').offlineProfile(nickname);
 if(!Number.isInteger(ramMB)||ramMB<4096||ramMB>32768)throw Error('Память: от 4 до 32 ГБ.');
 return ['-Xms512m',`-Xmx${ramMB}m`,'--enable-native-access=ALL-UNNAMED',...['java.lang','java.net','java.util','java.nio','java.io','jdk.internal.loader','jdk.internal.misc','sun.nio.ch'].map(n=>'--add-opens=java.base/'+n+'=ALL-UNNAMED'),'-cp','.','AstraBootstrap','--username',nickname,'--version','1.7.10','--gameDir','.','--assetsDir','assets','--assetIndex','1.7.10','--uuid',p.uuid,'--accessToken','0','--userProperties','{}','--width','1280','--height','720','--tweakClass','cpw.mods.fml.common.launcher.FMLTweaker'];
}
async function launchPortable(installer,nickname,ramMB,onProgress,onClose){
 const log=require('node:fs').createWriteStream(path.join(installer.gameDirectory,'launch.log'));let child;
 try{child=spawn(installer.javaPath,args(nickname,ramMB),{cwd:installer.gameDirectory,windowsHide:true,stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});}catch(e){log.end();throw e;}
 child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});child.once('close',code=>{log.end();onClose(code);});
 onProgress({phase:'running',message:'ASTRA TechnoMagic запускается. Загружаем локальную сборку…'});return child;
}
module.exports={isPortable,validPortable,inspectPortable,args,launchPortable};
