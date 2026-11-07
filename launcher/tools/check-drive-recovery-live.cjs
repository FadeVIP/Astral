'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {download}=require('../src/download.cjs'),{decode}=require('../src/catalog.cjs');
(async()=>{
 const root=path.resolve(__dirname,'../artifacts/download-audit-20261107');
 const snapshot=JSON.parse(await fs.readFile(path.join(root,'../download-catalog-live.json'),'utf8'));
 const pack=snapshot.documents.map(d=>decode({mapValue:{fields:d.fields}})).find(p=>p.name==='Наследие');
 let interrupted=false,resumed=false,downloaded=0;
 const destination=path.join(root,'recovery.zip');
 try{
 const result=await download({driveFileId:pack.driveFileId,sha256:pack.sha256,expectedBytes:pack.archiveBytes,destination,fetcher:async(url,options)=>{
  const response=await fetch(url,options);
  if(response.status===206&&options.headers.Range){resumed=true;console.log('RANGE_ACCEPTED',options.headers.Range,response.headers.get('content-range'));}
  if(interrupted||!response.ok||/text\/html/.test(response.headers.get('content-type')||''))return response;
  const reader=response.body.getReader();
  return new Response(new ReadableStream({async pull(controller){if(downloaded>=4*1024**2){interrupted=true;await reader.cancel();controller.error(new TypeError('Simulated connection reset'));console.log('INJECTED_RESET',downloaded);return;}const chunk=await reader.read();if(chunk.done)controller.close();else{downloaded+=chunk.value.length;controller.enqueue(chunk.value);}},cancel(){return reader.cancel();}}),{status:response.status,headers:response.headers});
 },onProgress:p=>{if(p.retryAttempt)console.log('RECONNECT',p.retryAttempt,p.received);}});
 assert.ok(interrupted);assert.ok(resumed);assert.equal(result.sha256,pack.sha256);console.log('LIVE_RESUME_SHA256_PASS',result.bytes);
 await fs.writeFile(path.join(root,'recovery-report.json'),JSON.stringify({interrupted,resumed,...result},null,2));
 }finally{await fs.rm(destination,{force:true});}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
