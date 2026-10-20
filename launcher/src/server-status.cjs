'use strict';
const tls=require('node:tls');
const crypto=require('node:crypto');
function queryStatus(config, connect=tls.connect) {
 return new Promise(resolve=>{
  const start=Date.now();let done=false,buffer=Buffer.alloc(0),latency;
  const socket=connect({host:config.host,port:config.port,rejectUnauthorized:false,minVersion:'TLSv1.2'});
  const finish=value=>{if(done)return;done=true;clearTimeout(timer);socket.destroy();resolve(value)};
  const timer=setTimeout(()=>finish({state:'unreachable',checkedAt:Date.now()}),config.statusTimeoutMs||9000);
  socket.on('error',()=>finish({state:'unreachable',checkedAt:Date.now()}));
  socket.on('end',()=>{if(!done)finish({state:'unreachable',checkedAt:Date.now()})});
  socket.once('secureConnect',()=>{
   const cert=socket.getPeerCertificate();
   if(!cert.raw || crypto.createHash('sha256').update(cert.raw).digest('hex')!==config.fingerprint.replace(/:/g,'').toLowerCase()){finish({state:'untrusted',checkedAt:Date.now()});return}
   latency=Date.now()-start;
   const body=Buffer.from('{"kind":"status"}'),size=Buffer.alloc(4);size.writeUInt32BE(body.length);socket.write(Buffer.concat([size,body]));
  });
  socket.on('data',data=>{
   buffer=Buffer.concat([buffer,data]);
   if(buffer.length>4096)return finish({state:'unreachable',checkedAt:Date.now()});
   if(buffer.length<4)return;
   const length=buffer.readUInt32BE(0);
   if(length>4092)return finish({state:'unreachable',checkedAt:Date.now()});
   if(buffer.length<4+length)return;
   try{
    const value=JSON.parse(buffer.subarray(4,4+length));
    if(value.state==='online' && (!Number.isInteger(value.online)||!Number.isInteger(value.max)||value.online<0||value.max<1||value.online>100000||value.max>100000))throw Error('counts');
    if(!['online','offline'].includes(value.state)||!Number.isFinite(value.checkedAt))throw Error('state');
    finish({state:value.state,...(value.state==='online'?{online:value.online,max:value.max,latency}:{}),checkedAt:value.checkedAt});
   }catch{finish({state:'unreachable',checkedAt:Date.now()})}
  });
 });
}
function statusCache(config){let cached=null,pending=null;return async()=>{
 if(cached&&Date.now()-cached.fetchedAt<10000)return cached;
 if(!pending)pending=queryStatus(config).then(value=>(cached={...value,fetchedAt:Date.now()})).finally(()=>{pending=null});
 return pending;
};}
module.exports={queryStatus,statusCache};
