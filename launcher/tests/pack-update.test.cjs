const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { repairPack, verifyManifest, recover } = require('../src/pack-update.cjs');
const { atomicJSON } = require('../src/install.cjs');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'astral-update-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const assets = path.join(root, 'assets'), instance = path.join(root, 'instance'), gameDirectory = path.join(instance, 'minecraft');
  await fs.mkdir(path.join(assets, 'client-mods'), { recursive: true }); await fs.mkdir(path.join(gameDirectory, 'mods'), { recursive: true }); await fs.mkdir(path.join(gameDirectory, 'config'));
  const keys = crypto.generateKeyPairSync('ed25519');
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }); await fs.writeFile(path.join(assets, 'pack-update-public.pem'), publicKey);
  const pack = { minecraft: '1.20.1', forge: '47', sha256: 'a'.repeat(64) };
  const m = { schema: 1, revision: 1, minecraft: pack.minecraft, forge: pack.forge, baseSha256: pack.sha256, files: [], remove: [] };
  const sign = value => { const bytes = Buffer.from(JSON.stringify(value)); return { payload: bytes.toString('base64'), signature: crypto.sign(null, bytes, keys.privateKey).toString('base64') }; };
  const contents = { 'mods/base.jar': 'original mod', 'config/personal.json': '{"preset":true}', 'mods/new.jar': 'new mod' };
  for (const [name, value] of Object.entries(contents)) m.files.push({ path: name, bytes: Buffer.byteLength(value), sha256: hash(value), policy: name.startsWith('config/') ? 'missing' : 'managed', source: name === 'mods/new.jar' ? 'release' : 'archive', ...(name === 'mods/new.jar' ? { url: 'https://github.com/FadeVIP/astral-launcher-downloads/releases/download/v1/new.jar' } : {}) });
  await fs.writeFile(path.join(assets, 'client-mods/new.jar'), contents['mods/new.jar']);
  const installer = { root, instance, gameDirectory, pack, report() {}, cachedDownload: async () => 'fixture', download: async () => { throw Error('unexpected download'); }, extract: async (zip, dest, { only }) => { for (const name of only) { await fs.mkdir(path.dirname(path.join(dest, name)), { recursive: true }); await fs.writeFile(path.join(dest, name), contents[name]); } } };
  const save = () => atomicJSON(path.join(assets, 'pack-manifest.json'), sign(m)); await save();
  return { root, assets, installer, m, sign, save, publicKey, contents };
}
test('repairs missing and corrupt files, preserves personal settings and worlds, idempotent', async t => {
  const f = await fixture(t), g = f.installer.gameDirectory;
  await fs.writeFile(path.join(g, 'mods/base.jar'), 'damaged'); await fs.writeFile(path.join(g, 'mods/extra.jar'), 'user mod');
  await fs.writeFile(path.join(g, 'config/personal.json'), 'custom settings'); await fs.mkdir(path.join(g, 'saves')); await fs.writeFile(path.join(g, 'saves/world'), 'precious');
  let result = await repairPack(f.installer, { assets: f.assets, offline: true }); assert.equal(result.repaired, 2);
  assert.equal(await fs.readFile(path.join(g, 'mods/base.jar'), 'utf8'), 'original mod');
  for (const [name, value] of [['config/personal.json', 'custom settings'], ['saves/world', 'precious'], ['mods/extra.jar', 'user mod']]) assert.equal(await fs.readFile(path.join(g, name), 'utf8'), value);
  result = await repairPack(f.installer, { assets: f.assets, offline: true }); assert.equal(result.repaired, 0);
  await fs.rm(path.join(g, 'config/personal.json')); assert.equal((await repairPack(f.installer, { assets: f.assets, offline: true })).repaired, 1);
});
test('rejects bad signature, escaping paths, removal of worlds and incompatible releases', async t => {
  const f = await fixture(t); const envelope = f.sign(f.m); envelope.signature = Buffer.alloc(64).toString('base64'); assert.throws(() => verifyManifest(envelope, f.publicKey, f.installer.pack), /Подпись/);
  for (const name of ['saves/world.dat', 'mods/../../outside.jar', 'mods/evil.jar:stream']) { const m = structuredClone(f.m); m.files[0].path = name; assert.throws(() => verifyManifest(f.sign(m), f.publicKey, f.installer.pack)); }
  const m = structuredClone(f.m); m.remove = ['saves/world.dat']; assert.throws(() => verifyManifest(f.sign(m), f.publicKey, f.installer.pack));
  m.remove = []; m.minecraft = '1.21'; assert.throws(() => verifyManifest(f.sign(m), f.publicKey, f.installer.pack));
});
test('bad repair payload leaves installed files untouched', async t => {
  const f = await fixture(t), g = f.installer.gameDirectory; await fs.writeFile(path.join(g, 'mods/base.jar'), 'old');
  f.installer.extract = async (zip, dest) => { await fs.mkdir(path.join(dest, 'mods'), { recursive: true }); await fs.writeFile(path.join(dest, 'mods/base.jar'), 'bad archive'); };
  await assert.rejects(repairPack(f.installer, { assets: f.assets, offline: true })); assert.equal(await fs.readFile(path.join(g, 'mods/base.jar'), 'utf8'), 'old');
  await assert.rejects(fs.stat(path.join(g, 'mods/new.jar')));
});
test('interrupted commit rolls back before next launch', async t => {
  const f = await fixture(t), id = crypto.randomUUID(), backup = path.join(f.installer.instance, '.astral-update-backups', id, 'mods');
  await fs.mkdir(backup, { recursive: true }); await fs.writeFile(path.join(backup, 'base.jar'), 'old');
  await fs.writeFile(path.join(f.installer.gameDirectory, 'mods/base.jar'), 'partly replaced'); await fs.writeFile(path.join(f.installer.gameDirectory, 'mods/new.jar'), 'partly added');
  await atomicJSON(path.join(f.installer.instance, '.astral-update-journal.json'), { id, rows: [{ path: 'mods/base.jar', existed: true }, { path: 'mods/new.jar', existed: false }] });
  await recover(f.installer); assert.equal(await fs.readFile(path.join(f.installer.gameDirectory, 'mods/base.jar'), 'utf8'), 'old'); await assert.rejects(fs.stat(path.join(f.installer.gameDirectory, 'mods/new.jar')));
});
test('signed remote update is applied and offline checks never downgrade cached release', async t => {
  const f = await fixture(t); await repairPack(f.installer, { assets: f.assets, offline: true });
  const next = structuredClone(f.m); next.revision = 2; next.remove = ['mods/base.jar']; next.files = next.files.filter(r => r.path !== 'mods/base.jar');
  const fetcher = async () => new Response(JSON.stringify(f.sign(next)));
  const result = await repairPack(f.installer, { assets: f.assets, fetcher }); assert.equal(result.revision, 2); assert.equal(result.removed, 1); assert.equal(result.online, true);
  assert.equal((await repairPack(f.installer, { assets: f.assets, offline: true })).revision, 2); await assert.rejects(fs.stat(path.join(f.installer.gameDirectory, 'mods/base.jar')));
});
