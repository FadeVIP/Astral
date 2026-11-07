'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {download}=require('../src/download.cjs'),{decode}=require('../src/catalog.cjs');
(async()=>{
 const root=path.resolve(__dirname,'../artifacts/download-audit-20261107');await fs.mkdir(root,{recursive:true});
 const snapshot=JSON.parse(await fs.readFile(path.join(root,'../download-catalog-live.json'),'utf8'));
 const packs=snapshot.documents.map(d=>({id:d.name.split('/').pop(),...decode({mapValue:{fields:d.fields}})})).filter(p=>p.published);
 const jobs=[],seen=new Set();
 for(const p of packs){jobs.push({name:p.name,driveFileId:p.driveFileId,expectedBytes:p.archiveBytes,sha256:p.sha256});for(const [kind,v]of [['Java',p.java],['Forge',p.forgeInstaller]])if(v?.url?.startsWith('https:')&&!seen.has(v.url)){seen.add(v.url);jobs.push({name:kind+' '+(v.version||p.forge),...v});}}
 const report=[];
 for(let i=0;i<jobs.length;i++){
  const job=jobs[i],destination=path.join(root,`${i}.zip`),start=Date.now();let last=0;
  console.log('START',job.name,job.expectedBytes);
  try{const result=await download({...job,destination,onProgress:p=>{if(Date.now()-last>15000||p.retryAttempt){last=Date.now();console.log('PROGRESS',job.name,p.received,p.retryAttempt||'');}}});report.push({name:job.name,ok:true,...result,seconds:Math.round((Date.now()-start)/1000)});console.log('PASS',job.name,result.bytes);}
  catch(e){report.push({name:job.name,ok:false,error:e.message});console.log('FAIL',job.name,e.message);}
  finally{await fs.rm(destination,{force:true});}
  await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2));
 }
 if(report.some(r=>!r.ok))process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1;});
