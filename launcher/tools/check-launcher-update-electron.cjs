'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
(async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),"Astral update проверка ' "));
 try{
  const source=path.join(directory,'new.exe'),code=path.join(directory,'Probe.cs');
  await fs.writeFile(code,'class Probe { static void Main() { System.IO.File.WriteAllText(System.IO.Path.Combine(System.AppDomain.CurrentDomain.BaseDirectory, "started.txt"), "restarted"); } }');
  const compiled=spawnSync(path.join(process.env.SystemRoot,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:winexe','/out:'+source,code],{encoding:'utf8',windowsHide:true});
  assert.equal(compiled.status,0,compiled.stdout+compiled.stderr);
  const env={...process.env,ASTRAL_UPDATE_TEST_DIR:directory};delete env.ELECTRON_RUN_AS_NODE;
  const run=spawnSync(require('electron'),[path.resolve(__dirname,'../tests/launcher-update-electron.cjs')],{env,encoding:'utf8',windowsHide:true,timeout:30000});
  assert.equal(run.status,0,run.stdout+run.stderr+(run.error?.message||''));assert.match(run.stdout,/UPDATER_ELECTRON_READY/);
  const jobFile=await fs.readFile(path.join(directory,'job-location.txt'),'utf8');
  let result='';
  for(let i=0;i<150;i++){
   result=await fs.readFile(jobFile+'.result','utf8').catch(()=>'');
   if(result && await fs.access(path.join(directory,'started.txt')).then(()=>true,()=>false))break;
   if(result.startsWith('FAILED'))throw Error(result);
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.equal(result,'UPDATED');assert.equal(await fs.readFile(path.join(directory,'started.txt'),'utf8'),'restarted');
  assert.deepEqual(await fs.readFile(path.join(directory,'Astral.exe')),await fs.readFile(source));
  const job=JSON.parse(await fs.readFile(jobFile));assert.equal(await fs.readFile(job.backup,'utf8'),'old launcher');
  console.log('PASS ELECTRON_UPDATE_REPLACE_AND_RESTART');
 }finally{await fs.rm(directory,{recursive:true,force:true,maxRetries:15,retryDelay:200});}
})().catch(e=>{console.error(e);process.exitCode=1;});
