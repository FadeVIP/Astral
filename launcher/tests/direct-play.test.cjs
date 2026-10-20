'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),net=require('node:net'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {DirectPlay}=require('../src/direct-play.cjs'),router=require('../src/direct-router.cjs');

test('friend rows distinguish approval from actual shared-world membership and clear on leaving',async()=>{
 let rows=[{id:'guest~host',host:'host',guest:'guest',status:'pending',expires:Date.now()+60000}];
 const service=new DirectPlay({access:async()=>({uid:'u',nick:'host',token:'test'}),friends:async()=>[{nickname:'guest',status:'accepted',presence:{playing:true}}],query:async(c,f)=>f==='host'?rows:[]},'.');
 assert.equal((await service.state()).friends[0].session,'incoming');
 service.gamePort=25565;rows[0].status='approved';
 assert.equal((await service.state()).friends[0].session,'waiting_guest');
 rows[0].expires=0;
 assert.equal((await service.state({inWorld:true,players:['GUEST']})).friends[0].session,'together');
 assert.equal((await service.state({inWorld:false,players:['GUEST']})).friends[0].session,'idle');
 assert.equal((await service.state({inWorld:true,players:[]})).friends[0].session,'idle');
});

test('guest sees accepted and pending requests; duplicate request does not replace approval',async()=>{
 const row={id:'guest~host',guest:'guest',host:'host',status:'approved',expires:Date.now()+60000};
 const service=new DirectPlay({access:async()=>({uid:'u',nick:'guest',token:'test'}),friends:async()=>[{nickname:'host',status:'accepted'}],query:async(c,f)=>f==='guest'?[row]:[],c:{request:()=>{throw Error('Approval must not be overwritten');}}},'.');
 assert.equal((await service.state()).friends[0].session,'approved');
 assert.match((await service.request('host')).message,/Подключиться/);
 row.status='pending';assert.equal((await service.state()).friends[0].session,'pending');
 row.status='declined';assert.equal((await service.state()).friends[0].session,'declined');
});
test('direct route wins; relay is attempted only after direct failure',async()=>{
 const relay=require('../src/relay-client.cjs'),original=relay.connect,authenticate=require('../src/direct-auth.cjs').authenticate;
 const auth=require('../src/direct-auth.cjs');let relayCalls=0;
 const endpoint=net.createServer(s=>{s.on('error',()=>{});s.resume();});await new Promise(r=>endpoint.listen(0,'0.0.0.0',r));
 const ip=Object.values(os.networkInterfaces()).flat().find(x=>x.family==='IPv4'&&!x.internal)?.address;
 if(!ip){await new Promise(r=>endpoint.close(r));return;}
 const rows=[{id:'guest~host',host:'host',status:'approved',expires:Date.now()+60000,token:'a'.repeat(64),endpoints:JSON.stringify([{host:ip,port:endpoint.address().port}])}];
 const service=new DirectPlay({access:async()=>({nick:'guest',token:'test'}),friends:async()=>[{nickname:'host',status:'accepted'}],query:async()=>rows},'.');
 try{auth.authenticate=async socket=>{await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});};relay.connect=async()=>{relayCalls++;throw Error('offline');};
  await service.join('guest~host');assert.equal(relayCalls,0);assert.match(service.status,/Прямое/);
  rows[0].endpoints='[]';await assert.rejects(service.join('guest~host'),/посредник/);assert.equal(relayCalls,1);
 }finally{relay.connect=original;auth.authenticate=authenticate;await service.close();await new Promise(r=>endpoint.close(r));}
});
test('gateway falls back from PCP rejection to leased NAT-PMP and deletes its mapping',async()=>{
 const udp=require('node:dgram').createSocket('udp4'),gateway=require('../src/direct-gateway.cjs');let deleted=false;
 udp.on('message',(p,remote)=>{let reply;if(p[0]===2){reply=Buffer.alloc(24);reply[0]=2;reply[1]=129;reply[3]=1;}else if(p[1]===0){reply=Buffer.from([0,128,0,0,0,0,0,0,8,8,8,8]);}else{reply=Buffer.alloc(16);reply[1]=130;reply.writeUInt16BE(p.readUInt16BE(4),8);reply.writeUInt16BE(32000,10);reply.writeUInt32BE(p.readUInt32BE(8),12);deleted=p.readUInt32BE(8)===0;}udp.send(reply,remote.port,remote.address);});
 await new Promise(r=>udp.bind(5351,'127.0.0.1',r));try{const mapping=await gateway.map('127.0.0.1','192.168.1.10',25565);assert.equal(mapping.protocol,'NAT-PMP');assert.equal(mapping.port,32000);assert.equal(mapping.external,'8.8.8.8');await gateway.renew(mapping,0);assert(deleted);}finally{udp.close();}
});
test('nonpublic router addresses are never reported as internet-ready',()=>{for(const ip of ['10.1.1.1','100.64.1.2','100.127.255.255','192.168.1.1','172.16.0.1','127.0.0.1','169.254.0.1','::1'])assert.equal(router.publicIPv4(ip),false);assert.equal(router.publicIPv4('8.8.8.8'),true);});
test('bridge rejects unauthenticated requests and foreign browser origins',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'astral-direct-'));const social={access:async()=>({uid:'user',nick:'host'}),friends:async()=>[],query:async()=>[]};const service=new DirectPlay(social,dir);
 try{const bridge=await service.start(),url='http://127.0.0.1:'+bridge.port+'/state';assert.equal((await fetch(url,{method:'POST',body:'{}'})).status,403);assert.equal((await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+bridge.token,Origin:'https://evil.invalid'},body:'{}'})).status,403);const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+bridge.token},body:'{}'});assert.equal(r.status,200);assert.deepEqual((await r.json()).friends,[]);}finally{await service.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('proxy requires approved token, preserves binary bytes, closes on stop',async()=>{
 const original=router.map;router.map=async()=>{throw Error('no router')};const dir=await fs.mkdtemp(path.join(os.tmpdir(),'astral-direct-'));let received=0;
 const game=net.createServer(s=>{s.on('error',()=>{});s.on('data',b=>{received+=b.length;s.write(b);});});await new Promise(r=>game.listen(0,'127.0.0.1',r));const service=new DirectPlay({},dir);
 try{await service.host(game.address().port);const port=service.proxy.address().port;
  await new Promise((resolve,reject)=>{const s=net.connect(port,'127.0.0.1',()=>s.write('bad\nBAD'));s.resume();s.on('close',resolve);s.on('error',reject);});assert.equal(received,0);
  const token='b'.repeat(64);service.grants.set(token,{expires:Date.now()+10000});const payload=Buffer.from([0,1,2,255,13,10]);
  const socket=net.connect(port,'127.0.0.1');await require('../src/direct-auth.cjs').authenticate(socket,token);
  await new Promise((resolve,reject)=>{socket.on('data',b=>{assert.deepEqual(b,payload);socket.destroy();resolve();});socket.setTimeout(2000,()=>{socket.destroy();reject(Error('timeout'));});socket.resume();socket.write(payload);});
  await service.stopHosting();assert.equal(service.grants.size,0);assert.equal(service.gamePort,0);
 }finally{router.map=original;await service.close();await new Promise(r=>game.close(r));await fs.rm(dir,{recursive:true,force:true});}
});

test('local progress stays available during an operation without cloud access and requires bridge authorization',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'astral-progress-'));
 const social={access:async()=>({uid:'user',nick:'host'})},service=new DirectPlay(social,dir);
 try{
  const bridge=await service.start(),url='http://127.0.0.1:'+bridge.port+'/progress';
  social.access=async()=>{throw Error('cloud unavailable');};
  service.busy=true;service.status='Checking router';service.gamePort=25565;
  assert.equal((await fetch(url,{method:'POST',body:'{}'})).status,403);
  assert.equal((await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+bridge.token,Origin:'https://evil.invalid'},body:'{}'})).status,403);
  const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+bridge.token},body:'{}'});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{busy:true,message:'Checking router',hosting:false});
 }finally{await service.close();await fs.rm(dir,{recursive:true,force:true});}
});
