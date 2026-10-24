'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),mode=process.argv.includes('--bot-only')?'bot':'all';
let files=['discord-bot.js','data-backend.json','pack-online.cjs','pack-reports.cjs','public-data.cjs','public-game-data.cjs','social-directory.cjs','mirror-writer.cjs'];
for(const name of ['package.json','package-lock.json','main.cjs','http.cjs','policy.cjs','store.cjs','schema.sql','mirrors.cjs','realtime-store.cjs','realtime-admin.cjs','realtime-http.cjs','realtime-policy.cjs','realtime-leases.cjs','realtime-remote.cjs','service-auth.cjs'])files.push('server/data-api/'+name);
if(mode==='all'){
 files.push(...['index.html','download.html','chat.html','firebase-config.js','realtime-api.js','sql-documents.js','account-api.js','account.js','public-data.js','community.js','acoin-admin.js','minepass-admin.js','easter-egg-admin.js','easter-egg.js','admin-boot.js','admin.html','pack-catalog.js','scripts/build-static.cjs','discord-presence.cjs','server/gateway.py','server/relay/relay.py','server/minepass/bridge.py','server/minepass/SiteConfigSync.java','server/minepass/client/PackPresence.java','server/astral-ui/AccountCosmetics.java','server/astral-ui/AccountSkins.java','server/astral-ui/PackPresence.java','launcher/pack.json','launcher/package.json','launcher/package-lock.json','launcher/RELEASE-NOTES.md','launcher/assets/pack-manifest.json']);
 for(const name of fs.readdirSync(path.join(root,'launcher/src')))if(/\.(cjs|json)$/.test(name))files.push('launcher/src/'+name);
 for(const name of ['astral-atmosphere-0.1.0.jar','astral-minepass-0.2.7.jar','astral-minepass-ui-0.3.4.jar'])files.push('launcher/assets/client-mods/'+name);
 for(const name of fs.readdirSync(path.join(root,'server/data-api/tests')))if(name.endsWith('.cjs'))files.push('server/data-api/tests/'+name);
 files.push('launcher/tools/publish-sql-source.cjs','launcher/tools/prepare-sql-release.cjs');
}
files=[...new Set(files)].sort();
const changes=files.map(p=>{if(/serviceAccount|\.env|\.bak$|Backups|private\.pem/i.test(p))throw Error('Forbidden path');const bytes=fs.readFileSync(path.join(root,p));if(!p.endsWith('.jar')&&/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|"private_key"\s*:\s*"-----|(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}/.test(bytes.toString()))throw Error('Secret detected');return {path:p,bytes,sha:crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex')};});
const c=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\nusername=FadeVIP\n\n',encoding:'utf8',env:{...process.env,GCM_INTERACTIVE:'never',GIT_TERMINAL_PROMPT:'0'},windowsHide:true}),token=c.stdout.split('\n').find(l=>l.startsWith('password='))?.slice(9).trim();if(!token)throw Error('GitHub credential missing');
async function api(route,method='GET',body){const r=await fetch('https://api.github.com/repos/FadeVIP/Astral'+route,{method,headers:{Authorization:'Bearer '+token,'User-Agent':'Astral-SQL-migration','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw Error('GitHub '+r.status);return r.json();}
(async()=>{
 const parent=(await api('/git/ref/heads/main')).object.sha,commit=await api('/git/commits/'+parent),tree=await api('/git/trees/'+commit.tree.sha+'?recursive=1');if(tree.truncated)throw Error('Truncated tree');
 const map=new Map(tree.tree.map(x=>[x.path,x.sha])),pending=changes.filter(x=>x.sha!==map.get(x.path));console.log(JSON.stringify({mode,parent,files:pending.map(x=>x.path)}));
 if(!process.argv.includes('--publish')||!pending.length)return;
 const entries=[];for(let i=0;i<pending.length;i+=4)await Promise.all(pending.slice(i,i+4).map(async x=>{const blob=await api('/git/blobs','POST',{encoding:'base64',content:x.bytes.toString('base64')});if(blob.sha!==x.sha)throw Error('Blob mismatch');entries.push({path:x.path,mode:'100644',type:'blob',sha:blob.sha});}));
 const nextTree=await api('/git/trees','POST',{base_tree:commit.tree.sha,tree:entries}),next=await api('/git/commits','POST',{message:mode==='bot'?'Route Discord bridge and statistics to PostgreSQL API':'Migrate Astral website, launcher and game clients to PostgreSQL; retain Firebase Auth',tree:nextTree.sha,parents:[parent]});await api('/git/refs/heads/main','PATCH',{sha:next.sha,force:false});console.log('PUBLISHED '+next.sha);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
