'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),version=require('../package.json').version;
const files=[['server/astral-ui/dist/astral-atmosphere-0.1.0.jar','astral-atmosphere-0.1.0.jar'],['server/minepass/dist/astral-minepass-0.2.7.jar','astral-minepass-0.2.7.jar'],['server/minepass/client/astral-minepass-ui-0.3.4.jar','astral-minepass-ui-0.3.4.jar']];
const envelope=JSON.parse(fs.readFileSync(path.join(root,'launcher/assets/pack-manifest.json')));
const pack=require('../pack.json'),pub=fs.readFileSync(path.join(root,'launcher/assets/pack-update-public.pem'));
const manifest=require('../src/pack-update.cjs').verifyManifest(envelope,pub,pack);
for(const [source,name]of files){
 const bytes=fs.readFileSync(path.join(root,source)),row=manifest.files.find(f=>f.path==='mods/'+name);
 if(!row)throw Error('Missing managed mod '+name);
 Object.assign(row,{bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),source:'release',policy:'managed',url:`https://github.com/FadeVIP/astral-launcher-downloads/releases/download/v${version}/${name}`});
 for(const target of ['launcher/assets/client-mods/','launcher/dist/'])fs.copyFileSync(path.join(root,source),path.join(root,target,name));
}
manifest.revision=Math.max(manifest.revision+1,2026102401);manifest.title='Astral · SQL: аккаунт, чат, онлайн и косметика';
const payload=Buffer.from(JSON.stringify(manifest)),privateKey=fs.readFileSync(path.join(root,'server/minepass/dist/pack-update-private.pem'));
const next={payload:payload.toString('base64'),signature:crypto.sign(null,payload,privateKey).toString('base64')};
require('../src/pack-update.cjs').verifyManifest(next,pub,pack);
for(const file of ['launcher/assets/pack-manifest.json','launcher/dist/astral-pack-manifest.json'])fs.writeFileSync(path.join(root,file),JSON.stringify(next,null,2));
console.log(JSON.stringify({version,revision:manifest.revision,mods:files.map(f=>f[1])}));
