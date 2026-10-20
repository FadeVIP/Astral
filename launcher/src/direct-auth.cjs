'use strict';
const crypto=require('node:crypto');
const id=token=>crypto.createHash('sha256').update(token).digest('hex');
const proof=(token,challenge)=>crypto.createHmac('sha256',token).update(challenge).digest('hex');
// Challenge/response keeps the admission secret off the public connection.
// This authenticates admission; it does not encrypt Minecraft's LAN traffic.
function authenticate(socket,token,timeout=5000){return new Promise((resolve,reject)=>{
 let buffer=Buffer.alloc(0),stage=0;const timer=setTimeout(()=>fail(Error('Direct connection timeout')),timeout);
 function cleanup(){clearTimeout(timer);socket.removeListener('data',read);socket.removeListener('error',fail);socket.removeListener('close',closed);}
 function fail(e){cleanup();socket.destroy();reject(e);}function closed(){fail(Error('Direct connection closed'));}
 function read(chunk){buffer=Buffer.concat([buffer,chunk]);const end=buffer.indexOf(10);if(end<0){if(buffer.length>128)fail(Error('Invalid handshake'));return;}const line=buffer.subarray(0,end).toString();buffer=buffer.subarray(end+1);
  if(stage===0){if(!/^[a-f0-9]{64}$/.test(line)){fail(Error('Not an Astral endpoint'));return;}stage=1;socket.write(id(token)+':'+proof(token,line)+'\n');}
  else{if(line!=='ASTRAL-OK'){fail(Error('Admission denied'));return;}socket.pause();cleanup();resolve(buffer);}
 }
 socket.on('data',read);socket.once('error',fail);socket.once('close',closed);
});}
module.exports={id,proof,authenticate};
