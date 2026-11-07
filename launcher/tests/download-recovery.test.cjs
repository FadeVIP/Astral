'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {download}=require('../src/download.cjs');
const data=Buffer.from('PK\x03\x04abcdefghijk'),sha256=crypto.createHash('sha256').update(data).digest('hex');
async function options(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'astral-recovery-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return {url:'https://github.com/example.zip',destination:path.join(dir,'file.zip'),expectedBytes:data.length,sha256,retryDelayMs:1,idleTimeoutMs:30};}
function stalled(){return new Response(new ReadableStream({start(c){c.enqueue(data.subarray(0,7));}}),{headers:{'content-length':String(data.length)}});}
test('stalled stream reconnects using Range and verifies the complete file',async t=>{
 const o=await options(t);let calls=0;const progress=[];
 const result=await download({...o,onProgress:p=>progress.push(p),fetcher:async(u,init)=>{if(++calls===1)return stalled();assert.equal(init.headers.Range,'bytes=7-');return new Response(data.subarray(7),{status:206,headers:{'content-range':`bytes 7-${data.length-1}/${data.length}`,'content-length':String(data.length-7)}});}});
 assert.equal(calls,2);assert.equal(result.sha256,sha256);assert.deepEqual(await fs.readFile(o.destination),data);assert.ok(progress.some(p=>p.retryAttempt===2));
});
test('server ignoring Range restarts without appending duplicate bytes',async t=>{const o=await options(t);let calls=0;await download({...o,fetcher:async()=>++calls===1?stalled():new Response(data)});assert.equal(calls,2);assert.deepEqual(await fs.readFile(o.destination),data);});
test('transient HTTP errors retry, permanent HTTP errors do not',async t=>{const o=await options(t);let calls=0;await download({...o,fetcher:async()=>++calls===1?new Response('',{status:503}):new Response(data)});assert.equal(calls,2);calls=0;await assert.rejects(download({...o,fetcher:async()=>{calls++;return new Response('',{status:403});}}));assert.equal(calls,1);});
test('wrong Range cannot produce an installed file',async t=>{const o=await options(t);let calls=0;await assert.rejects(download({...o,fetcher:async()=>++calls===1?stalled():new Response(data.subarray(7),{status:206,headers:{'content-range':`bytes 8-${data.length}/${data.length+1}`}})}));await assert.rejects(fs.stat(o.destination));});
test('cancellation interrupts retry delay and never reconnects',async t=>{const o=await options(t),controller=new AbortController();let calls=0;await assert.rejects(download({...o,signal:controller.signal,onProgress:p=>{if(p.retryAttempt)controller.abort();},fetcher:async()=>{calls++;throw new TypeError('fetch failed');}}),{name:'AbortError'});assert.equal(calls,1);});
test('persistent outage stops after four attempts and names the file and source',async t=>{const o=await options(t);let calls=0;await assert.rejects(download({...o,fetcher:async()=>{calls++;throw new TypeError('fetch failed');}}),/file.zip.*github.com/);assert.equal(calls,4);await assert.rejects(fs.stat(o.destination+'.part'));});
test('corruption after resume never passes the checksum',async t=>{const o=await options(t);let calls=0;await assert.rejects(download({...o,fetcher:async()=>++calls===1?stalled():new Response(Buffer.alloc(data.length-7),{status:206,headers:{'content-range':`bytes 7-${data.length-1}/${data.length}`}})}),/Контрольная сумма/);await assert.rejects(fs.stat(o.destination));});
test('without a checksum a reconnect starts from zero',async t=>{const o=await options(t);let calls=0;await download({...o,sha256:undefined,fetcher:async(u,init)=>{assert.equal(init.headers.Range,undefined);return ++calls===1?stalled():new Response(data);}});assert.equal(calls,2);assert.deepEqual(await fs.readFile(o.destination),data);});
test('stalled Drive confirmation is bounded and reconnects',async t=>{const o=await options(t);let calls=0;await download({...o,driveFileId:'abcdefghijk123456',fetcher:async()=>++calls===1?new Response(new ReadableStream({start(c){c.enqueue(Buffer.from('<html>'));}}),{headers:{'content-type':'text/html'}}):new Response(data)});assert.equal(calls,2);});
test('slow but active download is not interrupted by the idle timer',async t=>{
 const o=await options(t);let calls=0,index=0;
 await download({...o,idleTimeoutMs:200,fetcher:async()=>{calls++;return new Response(new ReadableStream({async pull(c){await new Promise(r=>setTimeout(r,40));if(index===data.length)c.close();else c.enqueue(data.subarray(index,++index));}}));}});
 assert.equal(calls,1);assert.deepEqual(await fs.readFile(o.destination),data);
});
