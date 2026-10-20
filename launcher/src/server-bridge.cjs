'use strict';
const net = require('node:net');
const tls = require('node:tls');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

async function startBridge(config, auth, onError = () => {}) {
  const sockets = new Set();
  const server = net.createServer(async local => {
    sockets.add(local); local.pause();
    let remote;
    const close = () => { local.destroy(); remote?.destroy(); sockets.delete(local); };
    local.on('error', close); local.on('close', close);
    try {
      await auth.requireAccess();
      if (local.destroyed) return;
      remote = tls.connect({ host: config.host, port: config.port, rejectUnauthorized: false, minVersion: 'TLSv1.2' });
      remote.on('error', () => { onError('Не удалось подключиться к серверу Astral.'); close(); });
      remote.on('close', close);
      remote.setTimeout(45000, close);
      remote.once('secureConnect', () => {
        // Pin is checked before any credential is transmitted.
        const cert = remote.getPeerCertificate();
        const fingerprint = cert.raw && crypto.createHash('sha256').update(cert.raw).digest('hex');
        if (fingerprint !== config.fingerprint.replace(/:/g, '').toLowerCase()) { onError('Сертификат сервера Astral не совпадает.'); close(); return; }
        const body = Buffer.from(JSON.stringify({ token: auth.session.idToken }));
        const length = Buffer.alloc(4); length.writeUInt32BE(body.length);
        remote.write(Buffer.concat([length, body]));
        remote.once('data', chunk => {
          if (chunk[0] !== 1) { close(); return; }
          remote.setTimeout(0);
          if (chunk.length > 1) local.write(chunk.subarray(1));
          local.pipe(remote); remote.pipe(local); local.resume();
        });
      });
    } catch (error) { onError(error.message); close(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.localPort ?? 25564, '127.0.0.1', resolve); });
  return { port: server.address().port, close() { for (const socket of sockets) socket.destroy(); server.close(); } };
}

// Preserve other servers as raw NBT compounds while restoring Astral first on every launch.
function skip(buffer, type, cursor) {
  const need = n => { if (n < 0 || cursor + n > buffer.length) throw new Error('NBT truncated'); const start = cursor; cursor += n; return start; };
  if ([1,2,3,4,5,6].includes(type)) need([0,1,2,4,8,4,8][type]);
  else if (type === 8) { const n = buffer.readUInt16BE(need(2)); need(n); }
  else if ([7,11,12].includes(type)) { const n = buffer.readInt32BE(need(4)); if(n < 0) throw new Error('NBT length'); need(n * ({7:1,11:4,12:8}[type])); }
  else if (type === 9) { const child = buffer[need(1)], count = buffer.readInt32BE(need(4)); if(count < 0 || count > 100000) throw new Error('NBT list'); for(let i=0;i<count;i++) cursor = skip(buffer,child,cursor); }
  else if (type === 10) { for (;;) { const child = buffer[need(1)]; if(!child)break; const n=buffer.readUInt16BE(need(2)); need(n); cursor=skip(buffer,child,cursor); } }
  else throw new Error('NBT type');
  return cursor;
}
const str = value => { const b=Buffer.from(value); const size=Buffer.alloc(2);size.writeUInt16BE(b.length);return Buffer.concat([size,b]); };
const tag = (key,value) => Buffer.concat([Buffer.from([8]),str(key),str(value)]);
function pinServer(buffer, port, custom) {
  const entries=[];
  if(buffer) {
    if(buffer[0]!==10) throw new Error('Invalid server list');
    let pos=3+buffer.readUInt16BE(1);
    while(buffer[pos]) {
      const type=buffer[pos++], size=buffer.readUInt16BE(pos);pos+=2;
      const key=buffer.toString('utf8',pos,pos+size);pos+=size;
      if(key==='servers' && type===9) {
        const child=buffer[pos++], count=buffer.readInt32BE(pos);pos+=4;
        if(count<0 || count>10000 || (count>0 ? child!==10 : child>12)) throw new Error('Invalid server list');
        for(let i=0;i<count;i++) { const end=skip(buffer,10,pos), entry=buffer.subarray(pos,end);pos=end;
          const matches = custom ? entry.includes(tag('ip',custom.address)) : entry.includes(Buffer.from('ASTRAL')) || entry.includes(Buffer.from('127.0.0.1:25564')) || entry.includes(Buffer.from('91.240.175.14:25565'));
          if(!matches) entries.push(entry);
        }
      } else pos=skip(buffer,type,pos);
    }
  }
  const astral=Buffer.concat([tag('name',custom ? custom.name : '✦ ASTRAL — официальный сервер'),tag('ip',custom ? custom.address : `127.0.0.1:${port}`),Buffer.from([0])]);
  const count=Buffer.alloc(4);count.writeInt32BE(entries.length+1);
  return Buffer.concat([Buffer.from([10,0,0,9]),str('servers'),Buffer.from([10]),count,astral,...entries,Buffer.from([0])]);
}
async function ensurePinnedServer(directory, port, custom) {
  const file=path.join(directory,'servers.dat');
  let existing=null; try { existing=await fs.readFile(file); } catch(error) { if(error.code!=='ENOENT') throw error; }
  const result=pinServer(existing,port,custom);
  if(existing) await fs.writeFile(file+'.astral-backup',existing);
  await fs.writeFile(file+'.tmp',result);await fs.rename(file+'.tmp',file);
}
function unpinAstralServer(buffer){
  if(!buffer||buffer[0]!==10)throw Error('Invalid server list');
  let pos=3+buffer.readUInt16BE(1),changed=false;const parts=[buffer.subarray(0,pos)];
  while(buffer[pos]){
    const begin=pos,type=buffer[pos++],length=buffer.readUInt16BE(pos);pos+=2;
    const key=buffer.toString('utf8',pos,pos+length);pos+=length;
    const end=skip(buffer,type,pos);
    if(key==='servers'&&type===9){
      // Minecraft writes an empty list with TAG_End (0), not TAG_Compound (10).
      const child=buffer[pos++],count=buffer.readInt32BE(pos);pos+=4;if(count<0||count>10000||(count>0?child!==10:child>12))throw Error('Invalid server list');
      const entries=[];
      for(let i=0;i<count;i++){const next=skip(buffer,10,pos),entry=buffer.subarray(pos,next);pos=next;
        const owned=entry.includes(tag('name','✦ ASTRAL — официальный сервер'))&&(entry.includes(Buffer.from('127.0.0.1:'))||entry.includes(tag('ip','91.240.175.14:25565')));
        if(owned)changed=true;else entries.push(entry);
      }
      const size=Buffer.alloc(4);size.writeInt32BE(entries.length);parts.push(Buffer.from([9]),str('servers'),Buffer.from([10]),size,...entries);
    }else parts.push(buffer.subarray(begin,end));
    pos=end;
  }
  parts.push(buffer.subarray(pos));return changed?Buffer.concat(parts):buffer;
}
async function removePinnedServer(directory,onWarning=()=>{}){
  const file=path.join(directory,'servers.dat'),existing=await fs.readFile(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(!existing)return;
  let next;
  try{next=unpinAstralServer(existing);}catch(error){
    // Removing an obsolete server is optional. Preserve unknown/damaged files
    // byte-for-byte and let Minecraft handle its own server-list recovery.
    onWarning('Не удалось прочитать servers.dat. Список серверов сохранён без изменений; запуск игры продолжается.');
    return;
  }
  if(next===existing)return;
  await fs.writeFile(file+'.astral-disabled-backup',existing,{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
  await fs.writeFile(file+'.tmp',next);await fs.rename(file+'.tmp',file);
}
module.exports={startBridge,pinServer,ensurePinnedServer,unpinAstralServer,removePinnedServer};
