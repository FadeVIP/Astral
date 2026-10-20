// Publish a reviewed source allowlist without touching the local Git index.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const files=[];
function add(p){if(!fs.existsSync(path.join(root,p)))throw Error('Missing '+p);files.push(p);}
function walk(p,accept=()=>true){for(const e of fs.readdirSync(path.join(root,p),{withFileTypes:true})){const f=p+'/'+e.name;if(e.isDirectory())walk(f,accept);else if(accept(f))add(f);}}
for(const dir of ['launcher/src','launcher/ui','assets/cosmetics'])walk(dir);
walk('launcher/tests',p=>p.endsWith('.cjs'));
walk('launcher/runtime-agent',p=>/\.(java|md)$/.test(p));
walk('server/astral-ui/early',p=>/\.(java|txt|md)$/.test(p)||p.endsWith('/LICENSE'));
for(const name of ['PackPresence.java','FriendsMenu.java','AccountCosmetics.java','AccountSkins.java','Appearance.java','AstralAtmosphere.java','EarlyAgent.java','build.cjs','build-early.cjs','README.md','CosmeticsTest.java'])add('server/astral-ui/'+name);
for(const name of fs.readdirSync(path.join(root,'launcher/assets')))if(fs.statSync(path.join(root,'launcher/assets',name)).isFile())add('launcher/assets/'+name);
for(const name of ['astral-atmosphere-0.1.0.jar','astral-minepass-0.2.7.jar','astral-minepass-ui-0.3.4.jar'])add('launcher/assets/client-mods/'+name);
for(const name of ['package.json','package-lock.json','pack.json','firestore.rules','RELEASE-NOTES.md','DIRECT-PLAY.md'])add('launcher/'+name);
for(const name of ['build-update-helper.cjs','build-lan-agent.cjs','check-electron.cjs','run-electron-check.cjs','check-launcher-update-electron.cjs','sign-free.ps1','sign-launcher-manifest.cjs','account-rules.txt','cosmetics-rules.txt','deploy-cosmetics.cjs','test-cosmetics-live.cjs','push-source-update.cjs'])add('launcher/tools/'+name);
add('scripts/build-cosmetics.cjs');
add('discord-presence.cjs');
add('discord-bot.js');
add('pack-online.cjs');
add('pack-reports.cjs');
for(const p of ['public-data.cjs','public-data.js','pack-catalog.js','account-api.js','cosmetics-admin.js','scripts/build-static.cjs'])add(p);
walk('assets/public-data');walk('launcher/assets/public-data');
for(const name of ['relay.py','deploy.py','README.md'])add('server/relay/'+name);
add('launcher/tools/test-relay-live.cjs');
add('launcher/tools/firebase-admin.cjs');
for(const name of ['direct-play-rules.txt','deploy-direct-play.cjs','test-direct-play-live.cjs','player-rules.txt','deploy-player-rules.cjs','test-player-live.cjs','publish-launcher-hotfix.cjs','UPDATE-CHANNELS.md'])add('launcher/tools/'+name);
const unique=[...new Set(files)].sort();
const forbidden=/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|"private_key"\s*:\s*"-----|(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}|AIza[\w-]{30,}/g;
for(const f of unique){if(/(?:serviceAccount|\.env|\.bak$|session\.json|\.log$)/i.test(f))throw Error('Forbidden path '+f);if(/\.(?:cjs|js|json|java|txt|ps1|cs|pem|html|md|rules)$/.test(f)){const s=fs.readFileSync(path.join(root,f),'utf8');const hits=[...s.matchAll(forbidden)];if(hits.some(m=>!m[0].startsWith('AIza')))throw Error('Potential secret in '+f);}}
if(process.argv.includes('--list')){console.log(JSON.stringify(unique));process.exit(0);}
const c=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\nusername=FadeVIP\n\n',encoding:'utf8',env:{...process.env,GCM_INTERACTIVE:'never',GIT_TERMINAL_PROMPT:'0'}}),token=c.stdout.split('\n').find(x=>x.startsWith('password='))?.slice(9).trim();if(!token)throw Error('Missing GitHub credential');
async function api(route,method='GET',data){const r=await fetch('https://api.github.com/repos/FadeVIP/Astral'+route,{method,headers:{Authorization:'Bearer '+token,'User-Agent':'Astral-source-publish','Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});if(!r.ok)throw Error('GitHub '+r.status+' '+route);return r.json();}
function sha(b){return crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');}
(async()=>{const parent=(await api('/git/ref/heads/main')).object.sha,commit=await api('/git/commits/'+parent),remote=await api('/git/trees/'+commit.tree.sha+'?recursive=1');if(remote.truncated)throw Error('Truncated tree');const map=new Map(remote.tree.map(e=>[e.path,e.sha]));const changes=unique.map(p=>({path:p,bytes:fs.readFileSync(path.join(root,p))})).filter(x=>sha(x.bytes)!==map.get(x.path));console.log(JSON.stringify({parent,files:changes.map(x=>x.path),bytes:changes.reduce((n,x)=>n+x.bytes.length,0)},null,2));if(!process.argv.includes('--publish')||!changes.length)return;
const tree=[];for(let i=0;i<changes.length;i+=4){await Promise.all(changes.slice(i,i+4).map(async x=>{const b=await api('/git/blobs','POST',{encoding:'base64',content:x.bytes.toString('base64')});if(b.sha!==sha(x.bytes))throw Error('Blob mismatch '+x.path);tree.push({path:x.path,mode:'100644',type:'blob',sha:b.sha});}));}
const nextTree=await api('/git/trees','POST',{base_tree:commit.tree.sha,tree}),next=await api('/git/commits','POST',{message:'Update Astral Launcher '+require('../package.json').version+' sources and cosmetics wardrobe',tree:nextTree.sha,parents:[parent]});await api('/git/refs/heads/main','PATCH',{sha:next.sha,force:false});const actual=(await api('/git/ref/heads/main')).object.sha;if(actual!==next.sha)throw Error('Remote head verification failed');console.log('SOURCE_PUSH_VERIFIED '+next.sha);
})().catch(e=>{console.error(e.message);process.exitCode=1});
