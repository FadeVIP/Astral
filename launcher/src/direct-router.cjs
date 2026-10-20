'use strict';
const {execFile}=require('node:child_process');
const net=require('node:net');
function publicIPv4(ip){if(net.isIP(ip)!==4)return false;const [a,b]=ip.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168));}
function powershell(script){return new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:12000,maxBuffer:16384},(e,out)=>e?reject(Error('Роутер не разрешил автоматическое открытие порта (UPnP).')):resolve(out.trim())));}
// Only map the authenticated Astral proxy, never Minecraft's unauthenticated LAN port.
async function upnp(port,owner){
 if(!Number.isInteger(port)||port<1024||port>65535||!/^Astral-[a-f0-9]{16}$/.test(owner))throw Error('Invalid mapping');
 const out=await powershell(`$ErrorActionPreference='Stop'
$route=Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1
$ip=(Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $route.InterfaceIndex | Where-Object {$_.IPAddress -notlike '169.254.*'} | Select-Object -First 1).IPAddress
$nat=New-Object -ComObject HNetCfg.NATUPnP
$maps=$nat.StaticPortMappingCollection
if($null -eq $maps){throw 'UPnP unavailable'}
$old=$null
try{$old=$maps.Item(${port},'TCP')}catch{}
if($null -ne $old){throw 'Port already mapped'}
$m=$maps.Add(${port},'TCP',${port},$ip,$true,'${owner}')
@{external=$m.ExternalIPAddress;internal=$ip;port=${port}} | ConvertTo-Json -Compress`);
 const result=JSON.parse(out);return {...result,public:publicIPv4(result.external),owner};
}
async function unmap(mapping){if(mapping?.protocol){await require('./direct-gateway.cjs').renew(mapping,0);return;}if(!mapping||!/^Astral-[a-f0-9]{16}$/.test(mapping.owner)||!Number.isInteger(mapping.port))return;
 await powershell(`$ErrorActionPreference='Stop'
$nat=New-Object -ComObject HNetCfg.NATUPnP
$m=$nat.StaticPortMappingCollection.Item(${mapping.port},'TCP')
if($null -ne $m -and $m.Description -eq '${mapping.owner}'){$nat.StaticPortMappingCollection.Remove(${mapping.port},'TCP')}`);
}
async function map(port,owner){
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid port');
 try{const route=JSON.parse(await powershell(`$ErrorActionPreference='Stop'
$r=Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' | Where-Object {$_.NextHop -ne '0.0.0.0'} | Sort-Object RouteMetric | Select-Object -First 1
$ip=(Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $r.InterfaceIndex | Where-Object {$_.IPAddress -notlike '169.254.*'} | Select-Object -First 1).IPAddress
@{gateway=$r.NextHop;internal=$ip} | ConvertTo-Json -Compress`));const m=await require('./direct-gateway.cjs').map(route.gateway,route.internal,port);return {...m,owner,public:publicIPv4(m.external)};}catch{}
 return upnp(port,owner);
}
module.exports={map,unmap,publicIPv4};
