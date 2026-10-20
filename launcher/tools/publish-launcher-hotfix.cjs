'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const version = require('../package.json').version, tag = 'v' + version;
const preview = process.argv.includes('--preview'), promote = process.argv.includes('--promote');
if(preview&&promote)throw Error('Choose preview or promote, not both');
const repo = '/repos/FadeVIP/astral-launcher-downloads';
const oldURL = /https:\/\/github\.com\/FadeVIP\/astral-launcher-downloads\/releases\/download\/v\d+\.\d+\.\d+\/Astral-Launcher-\d+\.\d+\.\d+-x64-signed\.exe/g;
const newURL = `https://github.com/FadeVIP/astral-launcher-downloads/releases/download/${tag}/Astral-Launcher-${version}-x64-signed.exe`;
const credential = spawnSync('git', ['credential', 'fill'], { input: 'protocol=https\nhost=github.com\nusername=FadeVIP\n\n', encoding: 'utf8', env: { ...process.env, GCM_INTERACTIVE: 'never', GIT_TERMINAL_PROMPT: '0' } });
const token = (credential.stdout || '').split('\n').find(x => x.startsWith('password='))?.slice(9).trim();
if (!token) throw Error('GitHub credential unavailable');
const headers = { Authorization: 'Bearer ' + token, 'User-Agent': 'Astral-hotfix-publisher' };
async function api(route, method = 'GET', body) {
  const r = await fetch('https://api.github.com' + route, { method, headers: { ...headers, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 404 && method === 'GET') return null;
  if (!r.ok) throw Error('GitHub HTTP ' + r.status);
  return r.json();
}
function editPage(html) {
  if (!html.match(oldURL)) throw Error('Unexpected download URL');
  const megabytes = Math.ceil(fs.statSync(path.join(root, 'launcher/dist', `Astral-Launcher-${version}-x64-signed.exe`)).size / 1024 ** 2);
  return html.replaceAll(oldURL, newURL)
    .replace('установит сборку с Google Drive и подключит вас к официальному серверу', 'установит сборку и обновления для локальной игры')
    .replace(/Версия \d+\.\d+\.\d+ ·/g, 'Версия ' + version + ' ·')
    .replace(/Версия \d+\.\d+\.\d+, около \d+ МБ/g, 'Версия ' + version + ', около ' + megabytes + ' МБ');
}
async function main() {
  // A release must pass the packaged runtime checks, even if build was invoked
  // directly instead of through npm's prebuild/postbuild hooks.
  const checks = spawnSync(process.execPath, [path.join(__dirname, 'check-electron.cjs'), '--packaged'], { stdio: 'inherit', windowsHide: true });
  if (checks.status !== 0) throw Error('Publication stopped: packaged launcher checks failed');
  const signed = spawnSync(process.execPath, [path.join(__dirname, 'sign-launcher-manifest.cjs')], { stdio: 'inherit', windowsHide: true });
  if (signed.status !== 0) throw Error('Publication stopped: launcher manifest signing failed');
  // The launcher's update URL follows releases/latest; keep the signed manifest
  // available there when promoting this executable-only hotfix to latest.
  const response = process.argv.includes('--migration') ? {ok:true,arrayBuffer:async()=>fs.readFileSync(path.join(root,'launcher/assets/pack-manifest.json'))} : await fetch('https://github.com/FadeVIP/astral-launcher-downloads/releases/latest/download/astral-pack-manifest.json');
  if (!response.ok) throw Error('Cannot preserve current pack manifest: ' + response.status);
  const remoteManifestBytes = Buffer.from(await response.arrayBuffer());
  const manifestBytes = (process.argv.includes('--local-minepass')||process.argv.includes('--atmosphere')) ? fs.readFileSync(path.join(root,'launcher/assets/pack-manifest.json')) : remoteManifestBytes;
  const envelope = JSON.parse(manifestBytes);
  const { verifyManifest } = require('../src/pack-update.cjs');
  const manifest = verifyManifest(envelope, fs.readFileSync(path.join(root, 'launcher/assets/pack-update-public.pem')), require('../pack.json'));
  if((process.argv.includes('--local-minepass')||process.argv.includes('--atmosphere'))){
    const previous=verifyManifest(JSON.parse(remoteManifestBytes),fs.readFileSync(path.join(root,'launcher/assets/pack-update-public.pem')),require('../pack.json'));
    if(manifest.revision<previous.revision||(manifest.revision===previous.revision&&JSON.stringify(manifest)!==JSON.stringify(previous)))throw Error('Pack publication must advance the live revision');
  }
  fs.writeFileSync(path.join(root, 'launcher/dist/astral-pack-manifest.json'), manifestBytes);
  console.log('PRESERVED_PACK_REVISION ' + manifest.revision);
  const files = [`Astral-Launcher-${version}-x64-signed.exe`, `Astral-Launcher-${version}-x64-signed.exe.sha256`, 'RikiMarci-Studio-Free.cer', 'astral-pack-manifest.json', 'astral-launcher-update.json'];
  if(process.argv.includes('--theme-asset'))files.push('astral-atmosphere-0.1.0.jar');
  if(process.argv.includes('--minepass-assets'))files.push(...require('../src/minepass-mods.cjs').FILES);
  if((process.argv.includes('--local-minepass')||process.argv.includes('--atmosphere')))files.push(...manifest.files.filter(f=>f.source==='release'&&f.url.includes('/download/'+tag+'/')).map(f=>path.basename(f.path)));
  const payloads = files.map(name => {
    const file = path.join(root, 'launcher/dist', name), data = fs.readFileSync(file);
    return { name, file, size: data.length, digest: 'sha256:' + crypto.createHash('sha256').update(data).digest('hex') };
  });
  payloads.sort((a,b)=>a.size-b.size);
  const repository = await api(repo);
  if (!repository || repository.private || repository.owner.login !== 'FadeVIP') throw Error('Unexpected download repository');
  let release = await api(repo + '/releases/tags/' + tag);
  if(!release)release=(await api(repo+'/releases?per_page=30')).find(r=>r.tag_name===tag&&r.draft);
  if (!release) release = await api(repo + '/releases', 'POST', {
    tag_name: tag, name: 'Astral Launcher ' + version, draft: true, prerelease: preview,
    body: fs.readFileSync(path.join(root, 'launcher/RELEASE-NOTES.md'), 'utf8')
  });
  for (const item of payloads) {
    let asset = release.assets.find(a => a.name === item.name);
    if (asset) {
      if (asset.size !== item.size || asset.digest !== item.digest) throw Error('Existing release asset differs: ' + item.name);
      continue;
    }
    const uploadURL=release.upload_url.replace(/\{.*$/, '') + '?name=' + encodeURIComponent(item.name);
    if(process.argv.includes('--curl-upload')){
      // Feed credentials on stdin, never in process arguments or progress output.
      const progressFile=path.join(root,'launcher/artifacts/release-upload-progress.txt');
      const result=spawnSync('curl.exe',['--config','-','--http1.1','--stderr',progressFile,'--show-error','--fail-with-body','--connect-timeout','20','--max-time','180','--speed-time','30','--speed-limit','1024','--request','POST','--data-binary','@'+item.file,uploadURL],{
        input:'header = "Authorization: Bearer '+token+'"\nheader = "User-Agent: Astral-hotfix-publisher"\nheader = "Content-Type: application/octet-stream"\nheader = "Expect:"\n',encoding:'utf8',windowsHide:true,timeout:910000,maxBuffer:1024*1024
      });
      if(result.status!==0){
        // GitHub can finish storing the file while the upload response times out.
        // Confirm its complete size and digest before deciding to retry.
        const current=await api(repo+'/releases/'+release.id);
        asset=current?.assets.find(a=>a.name===item.name&&a.state==='uploaded'&&a.size===item.size&&a.digest===item.digest);
        if(!asset)throw Error('Asset upload failed: '+item.name+' ('+result.status+') '+String(result.stderr).slice(0,200)+' '+String(result.stdout).slice(0,300));
      }else asset=JSON.parse(result.stdout);
    }else{
    const r = await fetch(uploadURL, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/octet-stream', 'Content-Length': String(item.size) },
      body: fs.readFileSync(item.file), signal:AbortSignal.timeout(120000)
    });
    if (!r.ok) throw Error('Asset upload HTTP ' + r.status);
    asset = await r.json();
    }
    if (asset.size !== item.size || asset.digest !== item.digest) throw Error('Uploaded asset checksum mismatch');
    console.log('VERIFIED_ASSET ' + item.name);
  }
  if(process.argv.includes('--draft-only')){console.log('DRAFT_READY '+tag);return;}
  if(!release.draft && !release.prerelease && preview)throw Error('Cannot turn a stable release into preview');
  if(release.prerelease&&!preview&&!promote)throw Error('Use --promote to publish a tested prerelease as stable');
  if (release.draft || promote) release = await api(repo + '/releases/' + release.id, 'PATCH', { draft: false, prerelease:preview, make_latest:preview?'false':'true' });
  console.log('RELEASE ' + release.html_url);
  if(preview){
    let channel=await api(repo+'/releases/tags/preview');
    if(!channel)channel=await api(repo+'/releases','POST',{tag_name:'preview',name:'Astral · тестовый канал',prerelease:true,make_latest:'false',body:'Добровольный предварительный канал обновлений лаунчера.'});
    if(!channel.prerelease)throw Error('Preview channel must be a prerelease');
    const name='astral-launcher-update.json',data=fs.readFileSync(path.join(root,'launcher/dist',name)),digest='sha256:'+crypto.createHash('sha256').update(data).digest('hex');
    const old=channel.assets.find(a=>a.name===name);
    if(old?.digest!==digest){
      if(old){const r=await fetch('https://api.github.com'+repo+'/releases/assets/'+old.id,{method:'DELETE',headers});if(!r.ok)throw Error('Cannot replace preview pointer');}
      const r=await fetch(channel.upload_url.replace(/\{.*$/,'')+'?name='+name,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:data});
      if(!r.ok)throw Error('Cannot upload preview pointer');const a=await r.json();if(a.digest!==digest)throw Error('Preview pointer checksum mismatch');
    }
    console.log('PREVIEW_CHANNEL_UPDATED; stable feed and website unchanged');return;
  }
  const site = '/repos/FadeVIP/Astral';
  const parent = (await api(site + '/git/ref/heads/main')).object.sha;
  const commit = await api(site + '/git/commits/' + parent);
  const changes = [];
  for (const file of ['index.html', 'download.html']) {
    const remote = await api(site + '/contents/' + file + '?ref=' + parent);
    const html = Buffer.from(remote.content, 'base64').toString('utf8');
    const edited = editPage(html);
    if (html !== edited) changes.push({ path: file, mode: '100644', type: 'blob', content: edited });
    const local = path.join(root, file);
    fs.writeFileSync(local, editPage(fs.readFileSync(local, 'utf8')));
  }
  if (changes.length) {
    const tree = await api(site + '/git/trees', 'POST', { base_tree: commit.tree.sha, tree: changes });
    const next = await api(site + '/git/commits', 'POST', { message: 'Offer Astral Launcher ' + version, tree: tree.sha, parents: [parent] });
    await api(site + '/git/refs/heads/main', 'PATCH', { sha: next.sha, force: false });
    console.log('SITE_COMMIT ' + next.sha);
  }
  console.log('DOWNLOAD ' + newURL);
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
