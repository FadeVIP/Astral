'use strict';
// Publish only reviewed application/public assets, never the dirty working tree.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'../..');process.chdir(root);
const c=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\nusername=FadeVIP\n\n',encoding:'utf8',env:{...process.env,GCM_INTERACTIVE:'never',GIT_TERMINAL_PROMPT:'0'}});
const token=c.stdout.split('\n').find(x=>x.startsWith('password='))?.slice(9).trim();if(!token)throw Error('Sign in to FadeVIP first');
async function api(route,method='GET',data){const r=await fetch('https://api.github.com'+route,{method,headers:{Authorization:'Bearer '+token,'User-Agent':'Astral-migration','Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});if(r.status===404||(r.status===409&&route.endsWith('/git/ref/heads/main')))return null;if(!r.ok)throw Error('GitHub '+r.status+' '+route);return r.json();}
function sha(data){return crypto.createHash('sha1').update('blob '+data.length+'\0').update(data).digest('hex');}
async function main(){
 if((await api('/user')).login!=='FadeVIP')throw Error('Wrong GitHub account');
 const list=spawnSync(process.execPath,['launcher/tools/push-source-update.cjs','--list'],{encoding:'utf8'});if(list.status!==0)throw Error('Cannot read allowlist');const files=new Set(JSON.parse(list.stdout));
 const builder=fs.readFileSync('scripts/build-static.cjs','utf8');for(const m of builder.split('const files = [')[1].split('];')[0].matchAll(/'([^']+)'/g))files.add(m[1]);
 for(const p of ['package.json','package-lock.json','render.yaml','scripts/build-static.cjs','launcher/tools/migrate-github.cjs'])files.add(p);
 function assets(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.name.startsWith('.')||e.isSymbolicLink())continue;const p=dir+'/'+e.name;if(e.isDirectory())assets(p);else if(/\.(png|jpe?g|webp|gif|svg|ico|avif|woff2?|ttf|ogg|mp3|wav|mp4|webm|json)$/i.test(p))files.add(p);}}assets('assets');
 const entries=[...files].sort().map(p=>({path:p,data:fs.readFileSync(p)}));
 for(const e of entries){if(e.data.length>95*1024**2)throw Error('Oversized source '+e.path);if(/(?:serviceAccount|\.env|private\.pem|session\.json)/i.test(e.path)||(/\.(js|cjs|json|txt|md|yaml|pem)$/.test(e.path)&&/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|"private_key"\s*:|(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}/.test(e.data.toString())))throw Error('Secret blocked: '+e.path);}
 console.log('REVIEWED_FILES',entries.length,'BYTES',entries.reduce((n,e)=>n+e.data.length,0));if(!process.argv.includes('--publish'))return;
 const repo='/repos/FadeVIP/Astral';let ref=await api(repo+'/git/ref/heads/main');
 if(!ref){await api(repo+'/contents/README.md','PUT',{message:'Initialize Astral migration',content:Buffer.from('# Astral\nOfficial website, launcher and Discord bot.\n').toString('base64'),branch:'main'});ref=await api(repo+'/git/ref/heads/main');}
 const checkout=path.join(root,'.migration-source');
 function git(args,cwd=root){const r=spawnSync('git',args,{cwd,encoding:'utf8',env:{...process.env,GCM_INTERACTIVE:'never',GIT_TERMINAL_PROMPT:'0'},timeout:300000,maxBuffer:1024*1024});if(r.status!==0)throw Error('Git migration failed: '+r.stderr.slice(0,1000));return r.stdout;}
 if(!fs.existsSync(checkout))git(['clone','https://FadeVIP@github.com/FadeVIP/Astral.git',checkout]);
 if(git(['remote','get-url','origin'],checkout).trim()!=='https://FadeVIP@github.com/FadeVIP/Astral.git')throw Error('Unexpected staging repository');
 for(const e of entries){const dest=path.join(checkout,e.path);fs.mkdirSync(path.dirname(dest),{recursive:true});if(!fs.existsSync(dest)||!fs.readFileSync(dest).equals(e.data))fs.writeFileSync(dest,e.data);}
 git(['config','user.name','FadeVIP'],checkout);git(['config','user.email','FadeVIP@users.noreply.github.com'],checkout);
 git(['add','--all'],checkout);if(git(['diff','--cached','--name-only'],checkout).trim())git(['commit','--quiet','-m','Migrate Astral website, launcher and bot to FadeVIP'],checkout);
 console.log('UPLOADING_REVIEWED_SOURCE');git(['push','origin','HEAD:main'],checkout);console.log('SOURCE_READY',git(['rev-parse','HEAD'],checkout).trim());
 let downloads=await api('/repos/FadeVIP/astral-launcher-downloads');if(!downloads)downloads=await api('/user/repos','POST',{name:'astral-launcher-downloads',description:'Official signed Astral Launcher releases',private:false,auto_init:true});if(downloads.owner.login!=='FadeVIP')throw Error('Wrong release owner');console.log('DOWNLOAD_REPOSITORY_READY');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
