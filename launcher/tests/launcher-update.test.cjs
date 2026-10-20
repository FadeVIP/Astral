'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { LauncherUpdater, verifyRelease, newer } = require('../src/launcher-update.cjs');
const keys = crypto.generateKeyPairSync('ed25519');
test('startup installs only a verified ready update; failures do not request restart',async()=>{
 for(const status of ['current','error','unsupported']) {
  let installed=false;
  assert.equal(await LauncherUpdater.prototype.startup.call({check:async()=>({status}),launchInstaller:async()=>{installed=true;}}),false);
  assert.equal(installed,false);
 }
 let installed=false;
 assert.equal(await LauncherUpdater.prototype.startup.call({check:async()=>({status:'ready'}),launchInstaller:async()=>{installed=true;}}),true);
 assert.equal(installed,true);
 await assert.rejects(LauncherUpdater.prototype.startup.call({check:async()=>({status:'ready'}),launchInstaller:async()=>{throw Error('helper failed');}}),/helper failed/);
});
const binary = Buffer.from('MZ\0\0signed-test-executable');
const digest = crypto.createHash('sha256').update(binary).digest('hex');
test('preview is opt-in, signed, falls back when absent and never downgrades',async t=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'astral-channels-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));
 const candidate={...release,version:'0.3.6',url:'https://github.com/FadeVIP/astral-launcher-downloads/releases/download/v0.3.6/Astral-Launcher-0.3.6-x64-signed.exe'};
 for(const [channel,mode,want] of [['stable','ok','0.3.5'],['preview','ok','0.3.6'],['preview','missing','0.3.5'],['preview','invalid',null]]){
  const seen=[];const updater=new LauncherUpdater({currentVersion:'0.3.4',directory:folder,target:path.join(folder,'app.exe'),supported:true,publicKey:keys.publicKey,channel,fetcher:async url=>{seen.push(url);if(url.includes('/download/preview/'))return mode==='missing'?new Response('',{status:404}):Response.json(mode==='invalid'?{payload:'bad',signature:'bad'}:sign(candidate));return url.endsWith('.json')?Response.json(sign(release)):new Response(binary);}});
  const result=await updater.check();assert.equal(result.status,want?'ready':'error');if(want)assert.equal(result.version,want);if(channel==='stable')assert.ok(!seen.some(u=>u.includes('/preview/')));
 }
});
const release = { schema: 1, type: 'astral-launcher-update', version: '0.3.5', platform: 'win32', arch: 'x64', bytes: binary.length, sha256: digest, url: 'https://github.com/FadeVIP/astral-launcher-downloads/releases/download/v0.3.5/Astral-Launcher-0.3.5-x64-signed.exe' };
function sign(value) { const payload = Buffer.from(JSON.stringify(value)); return { payload: payload.toString('base64'), signature: crypto.sign(null, payload, keys.privateKey).toString('base64') }; }

test('native updater rejects corruption and restores the original if restart fails', {skip:process.platform !== 'win32'}, async t => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "Astral native проверка ' "));
  t.after(() => fs.rm(folder,{recursive:true,force:true,maxRetries:10,retryDelay:100}));
  for(const mode of ['success','corrupt','rollback']) {
    const directory=path.join(folder,mode);await fs.mkdir(directory);
    const source=path.join(directory,'new.exe'),target=path.join(directory,'Astral.exe');
    await fs.writeFile(source,binary);await fs.writeFile(target,'original launcher');
    const jobFile=path.join(directory,'job.json');
    const job={parentPid:0,source,target,stage:path.join(directory,'stage.exe'),backup:path.join(directory,'previous.exe'),bytes:binary.length,sha256:mode==='corrupt'?'0'.repeat(64):digest,restart:mode==='rollback'};
    await fs.writeFile(jobFile,JSON.stringify(job));
    const result=spawnSync(path.resolve(__dirname,'../assets/launcher-update-helper.exe'),[jobFile],{windowsHide:true,timeout:10000});
    assert.equal(result.status,mode==='success'?0:1);
    assert.deepEqual(await fs.readFile(target),mode==='success'?binary:Buffer.from('original launcher'));
    assert.match(await fs.readFile(jobFile+'.result','utf8'),mode==='success'?/^UPDATED$/:/^FAILED:/);
    assert.equal(await fs.access(job.stage).then(()=>true,()=>false),false);
  }
});
test('signed launcher feed rejects tampering, wrong product, platform and download origin', () => {
  assert.equal(verifyRelease(sign(release), keys.publicKey).version, '0.3.5');
  for (const bad of [{ ...release, type: 'pack-update' }, { ...release, url: 'https://evil.invalid/app.exe' }, { ...release, platform: 'linux' }, { ...release, bytes: 2 ** 32 }, { ...release, version: '../evil' }]) assert.throws(() => verifyRelease(sign(bad), keys.publicKey));
  const altered = sign(release); altered.payload = Buffer.from(JSON.stringify({ ...release, version: '9.0.0' })).toString('base64');
  assert.throws(() => verifyRelease(altered, keys.publicKey), /Подлинность/);
  assert.equal(newer('0.3.10', '0.3.9'), true); assert.equal(newer('0.3.3', '0.3.4'), false); assert.equal(newer('0.3.4', '0.3.4'), false);
});
async function fixture(t, overrides = {}) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'astral-updater-test-'));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  let requests = 0, offline = false, corrupt = false;
  const fetcher = async url => {
    requests++; if (offline) throw Error('offline');
    return url.endsWith('.json') ? Response.json(sign(release)) : new Response(corrupt ? Buffer.from('MZbroken') : binary, { headers: { 'content-type': 'application/octet-stream' } });
  };
  const target = path.join(folder, 'Astral.exe'); await fs.writeFile(target, 'original');
  const updater = new LauncherUpdater({ currentVersion: '0.3.4', directory: path.join(folder, 'cache'), target, supported: true, publicKey: keys.publicKey, fetcher, ...overrides });
  return { updater, folder, requests: () => requests, offline: () => { offline = true; }, corrupt: () => { corrupt = true; } };
}
test('downloads only once, keeps verified update offline, refuses tampered EXE before replacement', async t => {
  const f = await fixture(t); const one = f.updater.check(), two = f.updater.check();
  assert.equal(one, two); assert.equal((await one).status, 'ready'); assert.equal(f.requests(), 2);
  f.offline(); assert.equal((await f.updater.check()).status, 'ready');
  const job = await f.updater.prepareInstall();
  const data = JSON.parse(await fs.readFile(job.jobFile));
  assert.equal(data.target, f.updater.target); assert.equal(data.sha256, digest); assert.equal(data.restart, true);
  f.updater.state.status = 'ready'; await fs.writeFile(f.updater.pending.destination, 'tampered');
  await assert.rejects(f.updater.prepareInstall(), /изменился/);
  assert.equal(await fs.readFile(f.updater.target, 'utf8'), 'original');
});
test('current/newer versions do not download; corrupted downloads never become ready', async t => {
  for (const currentVersion of ['0.3.5', '0.4.0']) {
    const f = await fixture(t, { currentVersion }); assert.equal((await f.updater.check()).status, 'current'); assert.equal(f.requests(), 1);
  }
  const f = await fixture(t); f.corrupt(); assert.equal((await f.updater.check()).status, 'error'); assert.equal(f.updater.pending, null);
  assert.deepEqual(await fs.readdir(f.updater.directory), []);
});
test('Windows helper replaces safely, preserves backup and rolls back failed commit', { skip: process.platform !== 'win32' }, async t => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "Astral обновление ' "));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const helper = path.resolve(__dirname, '../src/apply-launcher-update.ps1');
  const powershell = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  for (const mode of ['success', 'corrupt', 'rollback']) {
    const dir = path.join(folder, mode); await fs.mkdir(dir);
    const target = path.join(dir, 'Astral.exe'), source = path.join(dir, 'new.exe');
    await fs.writeFile(target, 'old launcher'); await fs.writeFile(source, binary);
    const job = { parentPid: 0, target, source, stage: path.join(dir, 'staged.exe'), backup: path.join(dir, 'previous.exe'), bytes: binary.length, sha256: mode === 'corrupt' ? '0'.repeat(64) : digest, restart: false };
    const jobFile = path.join(dir, 'job.json'); await fs.writeFile(jobFile, JSON.stringify(job));
    let args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper, '-JobFile', jobFile];
    if (mode === 'rollback') {
      const wrapper = path.join(dir, 'simulate-locked-file.ps1');
      await fs.writeFile(wrapper, `param([string]$Helper,[string]$JobFile)\nfunction Move-Item { param($LiteralPath,$Destination,$ErrorAction)\n if ([IO.Path]::GetFileName($LiteralPath) -eq 'staged.exe') { throw 'Simulated locked destination' }\n Microsoft.PowerShell.Management\\Move-Item @PSBoundParameters\n}\n. $Helper -JobFile $JobFile\nexit $LASTEXITCODE\n`);
      args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', wrapper, '-Helper', helper, '-JobFile', jobFile];
    }
    const result = spawnSync(powershell, args, { encoding: 'utf8', windowsHide: true, timeout: 15000 });
    assert.equal(result.status, mode === 'success' ? 0 : 1, result.stderr + await fs.readFile(jobFile + '.result', 'utf8').catch(() => 'no result'));
    assert.deepEqual(await fs.readFile(target), mode === 'success' ? binary : Buffer.from('old launcher'));
    if (mode === 'success') assert.equal(await fs.readFile(job.backup, 'utf8'), 'old launcher');
  }
});
test('Windows helper starts the replacement executable after installing it', { skip: process.platform !== 'win32' }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'astral-restart-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  const compiler = path.join(process.env.SystemRoot, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  const sourceCode = path.join(dir, 'RestartProbe.cs'), source = path.join(dir, 'next.exe'), target = path.join(dir, 'Astral.exe');
  await fs.writeFile(sourceCode, 'class RestartProbe { static void Main() { System.IO.File.WriteAllText(System.IO.Path.Combine(System.AppDomain.CurrentDomain.BaseDirectory, "started.txt"), "ok"); } }');
  const compile = spawnSync(compiler, ['/nologo', '/target:winexe', '/out:' + source, sourceCode], { encoding: 'utf8', windowsHide: true });
  assert.equal(compile.status, 0, compile.stdout + compile.stderr);
  await fs.writeFile(target, 'original');
  const data = await fs.readFile(source), jobFile = path.join(dir, 'job.json');
  await fs.writeFile(jobFile, JSON.stringify({ parentPid: 0, source, target, stage: path.join(dir, 'stage.exe'), backup: path.join(dir, 'backup.exe'), bytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex'), restart: true }));
  const run = spawnSync(path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.resolve(__dirname, '../src/apply-launcher-update.ps1'), '-JobFile', jobFile], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  assert.equal(run.status, 0, run.stderr + await fs.readFile(jobFile + '.result', 'utf8').catch(() => ''));
  for (let i = 0; i < 50 && !await fs.access(path.join(dir, 'started.txt')).then(() => true, () => false); i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(await fs.readFile(path.join(dir, 'started.txt'), 'utf8'), 'ok');
  assert.equal(await fs.readFile(jobFile + '.ready', 'utf8'), 'READY');
});
