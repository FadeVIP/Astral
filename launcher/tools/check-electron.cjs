'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const packaged = process.argv.includes('--packaged');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ASTRAL_TEST_PROFILE;
if (packaged) {
  const asar = require('@electron/asar');
  const bundle = path.join(root, 'dist/win-unpacked/resources/app.asar');
  const pkg = JSON.parse(asar.extractFile(bundle, 'package.json'));
  if (!asar.extractFile(bundle,'assets/astral-lan-agent.jar').equals(fs.readFileSync(path.join(root,'assets/astral-lan-agent.jar')))) throw Error('Packaged LAN agent differs');
  if (pkg.version !== require('../package.json').version) throw Error('Packaged version does not match source');
  const files = ['pack.json', 'assets/launcher-update-public.pem', 'assets/pack-update-public.pem', 'assets/cinematic-citadel.png', 'assets/cinematic-forest.png', 'assets/launcher-update-helper.exe', 'assets/launcher-update-helper.exe.json',
    ...['src', 'ui'].flatMap(dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).filter(x => x.isFile()).map(x => path.join(dir, x.name)))];
  for (const name of files) {
    if (!asar.extractFile(bundle, name).equals(fs.readFileSync(path.join(root, name)))) throw Error('Packaged file differs: ' + name);
  }
  for (const name of ['yauzl', 'minecraft-launcher-core']) asar.extractFile(bundle, path.join('node_modules', name, 'package.json'));
  env.ASTRAL_SMOKE_APP = bundle;
} else delete env.ASTRAL_SMOKE_APP;
const helperBuild = JSON.parse(fs.readFileSync(path.join(root,'assets/launcher-update-helper.exe.json')));
const hash = file => require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
if(helperBuild.sourceSha256 !== hash('src/LauncherUpdateHelper.cs') || helperBuild.sha256 !== hash('assets/launcher-update-helper.exe'))throw Error('Rebuild the launcher update helper before testing or publishing');
const cases = packaged ? [['auth-ipc-electron.cjs', 'AUTH_IPC_PASS'], ['catalog-ipc-electron.cjs','CATALOG_IPC_PASS']] : [['ipc-electron.cjs', 'PASS: registration IPC'], ['auth-ipc-electron.cjs', 'AUTH_IPC_PASS'], ['catalog-ipc-electron.cjs','CATALOG_IPC_PASS']];
for (const [file, marker] of cases) {
  const result = spawnSync(require('electron'), [path.join(root, 'tests', file)], { env, encoding: 'utf8', timeout: 60000, windowsHide: true });
  if (result.status !== 0 || !result.stdout?.includes(marker)) {
    console.error(result.stdout, result.stderr, result.error?.message || '');
    process.exit(1);
  }
  console.log('PASS ' + (packaged ? 'packaged ' : '') + file);
}
const update = spawnSync(process.execPath, [path.join(__dirname, 'check-launcher-update-electron.cjs')], {env, encoding:'utf8', timeout:60000, windowsHide:true});
if (update.status !== 0) { console.error(update.stdout, update.stderr); process.exit(1); }
console.log(update.stdout.trim());
