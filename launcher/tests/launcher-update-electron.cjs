'use strict';
const {app}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(process.env.ASTRAL_SMOKE_APP || path.join(__dirname,'..'));
const {LauncherUpdater}=require(path.join(root,'src/launcher-update.cjs'));
app.whenReady().then(async()=>{
 const directory=process.env.ASTRAL_UPDATE_TEST_DIR;if(!directory)throw Error('Isolated test directory required');
 const source=path.join(directory,'new.exe'),target=path.join(directory,'Astral.exe');
 const data=await fs.readFile(source);await fs.writeFile(target,'old launcher');
 const updater=new LauncherUpdater({currentVersion:'0.3.4',directory,target,supported:true,publicKey:''});
 updater.pending={destination:source,release:{version:'0.3.5',bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')}};
 updater.state={status:'ready'};
 const prepare=updater.prepareInstall.bind(updater);
 updater.prepareInstall=async()=>{const result=await prepare();await fs.writeFile(path.join(directory,'job-location.txt'),result.jobFile);return result;};
 await updater.launchInstaller();console.log('UPDATER_ELECTRON_READY');app.quit();
}).catch(e=>{console.error(e);app.exit(1);});
