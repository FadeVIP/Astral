'use strict';
const path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const source=path.resolve(__dirname,'../src/LauncherUpdateHelper.cs');
const binary=path.resolve(__dirname,'../assets/launcher-update-helper.exe');
const compiled=spawnSync(path.join(process.env.SystemRoot || 'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/optimize+','/target:winexe','/platform:x64','/reference:System.Web.Extensions.dll','/out:'+binary,source],{encoding:'utf8',windowsHide:true});
if(compiled.status!==0)throw Error(compiled.stdout+compiled.stderr+(compiled.error?.message||''));
fs.writeFileSync(binary+'.json',JSON.stringify({sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),sha256:crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex')},null,2));
console.log('UPDATE_HELPER_BUILT');
