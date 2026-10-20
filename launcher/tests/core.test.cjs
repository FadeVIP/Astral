'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { download, driveConfirmation, allowedURL } = require('../src/download.cjs');
const { extractZip, safeDestination } = require('../src/archive.cjs');
const { Installer } = require('../src/install.cjs');
const { offlineProfile, launchOptions } = require('../src/game.cjs');

function zipFixture(entries) {
  const locals = [], central = []; let offset = 0;
  for (const [name, content, mode = 0x8000] of entries) {
    const filename = Buffer.from(name); const data = Buffer.from(content);
    let crc = 0xffffffff;
    for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    locals.push(local, filename, data);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50); cd.writeUInt16LE(0x0314, 4); cd.writeUInt16LE(20, 6); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(filename.length, 28); cd.writeUInt32LE((mode << 16) >>> 0, 38); cd.writeUInt32LE(offset, 42);
    central.push(cd, filename); offset += local.length + filename.length + data.length;
  }
  const cd = Buffer.concat(central); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
async function temp(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'astral-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}
const fileId = 'abcdefghijk123456';
const confirmation = `<form id="download-form" action="https://drive.usercontent.google.com/download"><input name="id" value="${fileId}"><input name="confirm" value="t"><input name="uuid" value="a&amp;b"></form>`;
test('Drive confirmation preserves file identity and rejects other origins', () => {
  const url = new URL(driveConfirmation(confirmation, fileId));
  assert.equal(url.searchParams.get('uuid'), 'a&b');
  assert.throws(() => driveConfirmation(confirmation, 'another-file'));
  assert.throws(() => driveConfirmation(confirmation.replace('drive.usercontent.google.com', 'evil.example'), fileId));
  assert.throws(() => allowedURL('http://drive.google.com/file'));
  assert.throws(() => allowedURL('https://github.com.evil.example/file'));
});
test('Drive download handles confirmation and verifies full ZIP checksum', async t => {
  const dir = await temp(t); const zip = zipFixture([['mods/example.jar', 'example']]);
  let requests = 0;
  const result = await download({ driveFileId: fileId, destination: path.join(dir, 'pack.zip'), expectedBytes: zip.length, sha256: crypto.createHash('sha256').update(zip).digest('hex'), fetcher: async () => ++requests === 1 ? new Response(confirmation, { headers: { 'content-type': 'text/html' } }) : new Response(zip, { headers: { 'content-length': String(zip.length) } }) });
  assert.equal(requests, 2); assert.equal(result.bytes, zip.length);
  assert.deepEqual(await fs.readFile(path.join(dir, 'pack.zip')), zip);
});
test('HTML, truncation and checksum failures leave no installable download', async t => {
  const dir = await temp(t); const destination = path.join(dir, 'pack.zip'); const zip = zipFixture([['a', 'b']]);
  for (const options of [
    { fetcher: async () => new Response('<html>Quota</html>', { headers: { 'content-type': 'text/html' } }) },
    { expectedBytes: zip.length + 1, fetcher: async () => new Response(zip) },
    { sha256: '0'.repeat(64), fetcher: async () => new Response(zip) }
  ]) {
    await assert.rejects(download({ url: 'https://github.com/file.zip', destination, ...options }));
    await assert.rejects(fs.stat(destination)); await assert.rejects(fs.stat(destination + '.part'));
  }
});
test('Download cancellation removes partial file', async t => {
  const dir = await temp(t); const controller = new AbortController();
  const body = new ReadableStream({ start(c) { c.enqueue(Buffer.from('PK\x03\x04')); }, cancel() {} });
  const task = download({ url: 'https://github.com/file.zip', destination: path.join(dir, 'pack.zip'), signal: controller.signal, fetcher: async () => new Response(body) });
  setTimeout(() => controller.abort(), 30);
  await assert.rejects(task, { name: 'AbortError' });
  assert.deepEqual(await fs.readdir(dir), []);
});
test('ZIP extraction preserves data and blocks traversal, links and Windows aliases', async t => {
  const dir = await temp(t);
  const archive = path.join(dir, 'test.zip');
  await fs.writeFile(archive, zipFixture([['mods/example.jar', 'mod-data']]));
  await extractZip(archive, path.join(dir, 'good'));
  assert.equal(await fs.readFile(path.join(dir, 'good/mods/example.jar'), 'utf8'), 'mod-data');
  for (const bad of ['../escape', '/absolute', 'C:/absolute', 'mods/x:stream', 'NUL.txt', 'mods/../escape', 'mods/a.']) assert.throws(() => safeDestination(dir, bad));
  await fs.writeFile(archive, zipFixture([['link', '../outside', 0xa000]]));
  await assert.rejects(extractZip(archive, path.join(dir, 'bad')), /Ссылки/);
});
test('Installer creates a Forge instance without replacing an existing world', async t => {
  const root = await temp(t);
  const pack = { ...require('../pack.json'), archiveBytes: 200, sha256: '', driveFileId: fileId };
  const downloads = async ({ destination, driveFileId }) => {
    const zip = driveFileId ? zipFixture([['mods/example.jar', 'mod']]) : destination.endsWith('.jar') ? zipFixture([['install_profile.json', '{}']]) : zipFixture([[pack.java.folder + '/bin/java.exe', 'test-only']]);
    await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.writeFile(destination, zip);
    return { bytes: zip.length, sha256: crypto.createHash('sha256').update(zip).digest('hex') };
  };
  const installer = new Installer(root, pack, () => {}, { download: downloads });
  await installer.install(6144, new AbortController().signal);
  assert.equal(await installer.installed(), true);
  assert.equal(launchOptions(installer, 'TestPlayer', 6144).version.number, '1.20.1');
  const saves = path.join(installer.instance, 'minecraft/saves');
  await fs.mkdir(saves); await fs.writeFile(path.join(saves, 'world.dat'), 'keep-my-world');
  await installer.install(8192, new AbortController().signal);
  assert.equal(await fs.readFile(path.join(saves, 'world.dat'), 'utf8'), 'keep-my-world');
  await installer.setMemory(8192);
  assert.equal(launchOptions(installer, 'TestPlayer', 8192).memory.max, '8192M');
  await assert.rejects(installer.setMemory(999999));
});
test('Offline identity is deterministic and contains no Firebase credentials', () => {
  const user = offlineProfile('Notch');
  assert.equal(user.uuid, 'b50ad385829d3141a2167e7d7539ba7f');
  assert.equal(user.access_token, '0');
  assert.throws(() => offlineProfile('bad name'));
  assert.throws(() => offlineProfile('--server=host'));
});
