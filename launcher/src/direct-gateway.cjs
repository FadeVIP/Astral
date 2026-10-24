'use strict';
const dgram=require('node:dgram'),crypto=require('node:crypto'),net=require('node:net');
function exchange(gateway,packet,version,opcode){return new Promise((resolve,reject)=>{
 const socket=dgram.createSocket('udp4');const timer=setTimeout(()=>done(Error('Gateway timeout')),1600);let finished=false;
 function done(error,data){if(finished)return;finished=true;clearTimeout(timer);socket.close();error?reject(error):resolve(data);}
 socket.on('error',e=>done(e));socket.on('message',(data,remote)=>{if(remote.address===gateway&&remote.port===5351&&data[0]===version&&data[1]===(opcode|128))done(null,data);});socket.send(packet,5351,gateway,e=>{if(e)done(e);});
});}
function pcpPacket(mapping,lifetime){const p=Buffer.alloc(60);p[0]=2;p[1]=1;p.writeUInt32BE(lifetime,4);p[18]=255;p[19]=255;mapping.internal.split('.').forEach((b,i)=>p[20+i]=Number(b));Buffer.from(mapping.nonce,'hex').copy(p,24);p[36]=6;p.writeUInt16BE(mapping.localPort,40);p.writeUInt16BE(mapping.port,42);p[54]=255;p[55]=255;return p;}
function pmpPacket(mapping,lifetime){const p=Buffer.alloc(12);p[1]=2;p.writeUInt16BE(mapping.localPort,4);p.writeUInt16BE(mapping.port,6);p.writeUInt32BE(lifetime,8);return p;}
async function renew(mapping,lifetime=120){
 if(mapping.protocol==='PCP'){const data=await exchange(mapping.gateway,pcpPacket(mapping,lifetime),2,1);if(data.length<60||data[3]!==0||data.subarray(24,36).toString('hex')!==mapping.nonce||data.readUInt16BE(40)!==mapping.localPort||data[54]!==255||data[55]!==255)throw Error('PCP mapping refused');const ip=data.subarray(56,60).join('.');return {...mapping,port:data.readUInt16BE(42),external:ip,lifetime:data.readUInt32BE(4)};}
 const data=await exchange(mapping.gateway,pmpPacket(mapping,lifetime),0,2);if(data.length<16||data.readUInt16BE(2)!==0||data.readUInt16BE(8)!==mapping.localPort)throw Error('NAT-PMP mapping refused');return {...mapping,port:data.readUInt16BE(10),lifetime:data.readUInt32BE(12)};
}
async function map(gateway,internal,port){
 if(net.isIP(gateway)!==4||net.isIP(internal)!==4)throw Error('No IPv4 gateway');
 try{return await renew({protocol:'PCP',gateway,internal,localPort:port,port,nonce:crypto.randomBytes(12).toString('hex')});}catch{}
 const address=await exchange(gateway,Buffer.from([0,0]),0,0);if(address.length<12||address.readUInt16BE(2)!==0)throw Error('NAT-PMP address unavailable');return renew({protocol:'NAT-PMP',gateway,internal,localPort:port,port,external:address.subarray(8,12).join('.')});
}
module.exports={map,renew,pcpPacket,pmpPacket};
