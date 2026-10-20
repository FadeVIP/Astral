'use strict';
const tls=require('node:tls'),crypto=require('node:crypto');
const defaults=require('./relay-config.json');
function connect(header,config=defaults){return new Promise((resolve,reject)=>{
 if(!config.fingerprint)return reject(Error('Посредник не настроен.'));
 const socket=tls.connect({host:config.host,port:config.port,rejectUnauthorized:false,minVersion:'TLSv1.2'});
 let buffer=Buffer.alloc(0),ready=false,settled=false;
 const timer=setTimeout(()=>fail(Error('Посредник не ответил.')),15000);
 function cleanup(){clearTimeout(timer);socket.removeListener('data',read);socket.removeListener('error',fail);socket.removeListener('close',closed);}
 function fail(e){cleanup();socket.destroy();if(!settled){settled=true;reject(e);}}
 function closed(){fail(Error('Соединение с посредником закрыто.'));}
 function read(chunk){buffer=Buffer.concat([buffer,chunk]);let end;while((end=buffer.indexOf(10))>=0){const line=buffer.subarray(0,end).toString();buffer=buffer.subarray(end+1);
  if(header.role==='host'&&!ready&&line==='READY'){ready=true;clearTimeout(timer);continue;}
  if(line!=='PAIRED'){fail(Error('Посредник отказал в доступе.'));return;}
  socket.pause();cleanup();if(buffer.length)socket.unshift(buffer);settled=true;resolve(socket);return;
 }if(buffer.length>128)fail(Error('Неверный ответ посредника.'));}
 socket.once('secureConnect',()=>{const cert=socket.getPeerCertificate().raw;const actual=cert&&crypto.createHash('sha256').update(cert).digest('hex');if(actual!==config.fingerprint){fail(Error('Сертификат посредника не совпадает.'));return;}socket.write(JSON.stringify(header)+'\n');});
 socket.on('data',read);socket.once('error',fail);socket.once('close',closed);
 if(header.signal){const abort=()=>fail(Error('Открытие мира отменено.'));header.signal.addEventListener('abort',abort,{once:true});socket.once('close',()=>header.signal.removeEventListener('abort',abort));if(header.signal.aborted)abort();}
 });}
module.exports={connect};
