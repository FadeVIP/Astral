'use strict';
const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const { safeDestination } = require('./archive.cjs');
const { hashFile, atomicJSON, readJSON } = require('./install.cjs');
const { allowedURL } = require('./download.cjs');
const ASSETS = path.join(__dirname, '..', 'assets');
const FEED = 'https://github.com/FadeVIP/astral-launcher-downloads/releases/latest/download/astral-pack-manifest.json';
const RELEASES = 'https://github.com/FadeVIP/astral-launcher-downloads/releases/download/';
const mutable = name => /^(config|defaultconfigs|fancymenu_data)\//.test(name);
function validPath(name) {
  if (typeof name !== 'string' || !/^(mods|resourcepacks|shaderpacks|config|defaultconfigs|fancymenu_data)\/.+/.test(name)) throw new Error('Недопустимый файл обновления.');
  safeDestination(path.resolve('validation'), name);
}
function verifyManifest(envelope, publicKey, pack) {
  if (!envelope || typeof envelope.payload !== 'string' || envelope.payload.length > 4 * 1024 * 1024 || typeof envelope.signature !== 'string') throw new Error('Повреждён список обновлений.');
  const payload = Buffer.from(envelope.payload, 'base64');
  if (!crypto.verify(null, payload, publicKey, Buffer.from(envelope.signature, 'base64'))) throw new Error('Подпись обновления не подтверждена.');
  const m = JSON.parse(payload);
  if (m.schema !== 1 || !Number.isSafeInteger(m.revision) || m.revision < 1 || m.minecraft !== pack.minecraft || m.forge !== pack.forge || m.baseSha256 !== pack.sha256 || !Array.isArray(m.files) || m.files.length > 20000) throw new Error('Для этой версии сборки нужен новый лаунчер.');
  const names = new Set();
  for (const row of m.files) {
    validPath(row.path);
    if (names.has(row.path.toLowerCase())) throw new Error('Повторяющийся файл обновления.');
    names.add(row.path.toLowerCase());
    if (!/^[a-f0-9]{64}$/.test(row.sha256) || !Number.isSafeInteger(row.bytes) || row.bytes < 0 || row.bytes > 2 * 1024 ** 3 || row.policy !== (mutable(row.path) ? 'missing' : 'managed')) throw new Error('Некорректный файл обновления.');
    if (row.source !== 'archive' && (typeof row.url !== 'string' || !row.url.startsWith(RELEASES) || !row.path.endsWith('.jar'))) throw new Error('Неизвестный источник обновления.');
  }
  if (!Array.isArray(m.remove) || m.remove.length > 1000) throw new Error('Некорректный список заменённых модов.');
  for (const name of m.remove) { validPath(name); if (!/^mods\/[^/]+\.jar$/.test(name) || names.has(name.toLowerCase())) throw new Error('Нельзя убрать этот файл.'); }
  return m;
}
async function targetFor(root, name) {
  const target = safeDestination(root, name);
  let current = path.resolve(root);
  for (const component of [null, ...name.split('/')]) {
    if (component) current = path.join(current, component);
    const stat = await fs.lstat(current).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
    if (stat?.isSymbolicLink()) throw new Error('Обновление остановлено: в пути файла обнаружена ссылка.');
  }
  return target;
}
async function fetchEnvelope(signal, fetcher = fetch) {
  let url = FEED;
  for (let n = 0; n < 8; n++) {
    allowedURL(url);
    const response = await fetcher(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]), redirect: 'manual' });
    if ([301, 302, 303, 307, 308].includes(response.status)) { const location = response.headers.get('location'); await response.body?.cancel(); if (!location) throw new Error('Пустой адрес обновления.'); url = new URL(location, url).href; continue; }
    if (!response.ok) { await response.body?.cancel(); throw new Error('Сервер обновлений: HTTP ' + response.status); }
    const chunks = []; let bytes = 0;
    for await (const chunk of response.body) { bytes += chunk.length; if (bytes > 4 * 1024 * 1024) throw new Error('Слишком большой список обновлений.'); chunks.push(chunk); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  throw new Error('Слишком много перенаправлений.');
}
async function recover(installer) {
  const journalPath = path.join(installer.instance, '.astral-update-journal.json'), journal = await readJSON(journalPath);
  if (!journal) return;
  if (!/^[a-f0-9-]{36}$/.test(journal.id) || !Array.isArray(journal.rows)) throw new Error('Повреждена запись восстановления обновления.');
  const backup = path.join(installer.instance, '.astral-update-backups', journal.id);
  for (const row of [...journal.rows].reverse()) {
    validPath(row.path); const target = await targetFor(installer.gameDirectory, row.path), saved = safeDestination(backup, row.path);
    if (await fs.stat(saved).catch(() => null)) { await fs.mkdir(path.dirname(target), { recursive: true }); await fs.rm(target, { force: true }); await fs.rename(saved, target); }
    else if (!row.existed) await fs.rm(target, { force: true });
  }
  await fs.rm(journalPath);
}
async function repairPack(installer, { signal = new AbortController().signal, assets = ASSETS, fetcher, offline = false, exclude = new Set() } = {}) {
  await recover(installer);
  installer.report('verify', 'Проверяем обновления сборки…');
  const publicKey = await fs.readFile(path.join(assets, 'pack-update-public.pem'));
  const embedded = JSON.parse(await fs.readFile(path.join(assets, 'pack-manifest.json'), 'utf8'));
  let envelope = embedded, manifest = verifyManifest(embedded, publicKey, installer.pack), online = false;
  const cachePath = path.join(installer.instance, '.astral-update-manifest.json');
  const cached = await readJSON(cachePath);
  if (cached) { const candidate = verifyManifest(cached, publicKey, installer.pack); if (candidate.revision >= manifest.revision) { manifest = candidate; envelope = cached; } }
  if (!offline) {
    let remote;
    try { remote = await fetchEnvelope(signal, fetcher); online = true; }
    catch (e) { signal.throwIfAborted(); installer.report('verify', 'Сервер обновлений недоступен. Проверяем последнюю сохранённую версию.'); }
    if (remote) { const candidate = verifyManifest(remote, publicKey, installer.pack); if (candidate.revision >= manifest.revision) { manifest = candidate; envelope = remote; } }
  }
  const damaged = []; let count = 0;
  for (const row of manifest.files) {
    if(exclude.has(row.path.toLowerCase()))continue;
    signal.throwIfAborted(); const target = await targetFor(installer.gameDirectory, row.path);
    const stat = await fs.stat(target).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
    if (stat && !stat.isFile()) throw new Error('Вместо файла обнаружена папка: ' + row.path);
    if (!stat || row.policy === 'managed' && (stat.size !== row.bytes || await hashFile(target, signal) !== row.sha256)) damaged.push(row);
    installer.report('verify', 'Проверяем файлы сборки…', { count: ++count, totalFiles: manifest.files.length });
  }
  const remove = [];
  for (const name of manifest.remove) { if(exclude.has(name.toLowerCase()))continue; const target = await targetFor(installer.gameDirectory, name); if (await fs.stat(target).catch(() => null)) remove.push(name); }
  const result = { revision: manifest.revision, checked: count, repaired: damaged.length, removed: remove.length, online };
  if (!damaged.length && !remove.length) { await atomicJSON(cachePath, envelope); return result; }
  const stageRoot = path.join(installer.root, '.staging'); await fs.mkdir(stageRoot, { recursive: true });
  const stage = await fs.mkdtemp(path.join(stageRoot, 'repair-'));
  try {
    const archiveRows = damaged.filter(row => row.source === 'archive');
    if (archiveRows.length) {
      const zip = await installer.cachedDownload('astral-' + installer.pack.driveFileId + '.zip', { driveFileId: installer.pack.driveFileId, expectedBytes: installer.pack.archiveBytes, sha256: installer.pack.sha256 }, signal);
      installer.report('extract', 'Восстанавливаем недостающие файлы из архива…');
      await installer.extract(zip, stage, { signal, only: new Set(archiveRows.map(row => row.path)) });
    }
    for (const row of damaged.filter(row => row.source !== 'archive')) {
      signal.throwIfAborted(); const staged = safeDestination(stage, row.path); await fs.mkdir(path.dirname(staged), { recursive: true });
      const bundled = path.join(assets, 'client-mods', path.basename(row.path));
      if (await fs.stat(bundled).catch(() => null) && await hashFile(bundled, signal) === row.sha256) await fs.copyFile(bundled, staged);
      else await installer.download({ url: row.url, destination: staged, sha256: row.sha256, expectedBytes: row.bytes, signal, onProgress: value => installer.report('download', 'Обновляем ' + path.basename(row.path), value) });
    }
    for (const row of damaged) if (await hashFile(safeDestination(stage, row.path), signal) !== row.sha256) throw new Error('Восстановленный файл не прошёл проверку: ' + row.path);
    signal.throwIfAborted();
    const id = crypto.randomUUID(), backup = path.join(installer.instance, '.astral-update-backups', id), rows = [];
    for (const name of [...damaged.map(r => r.path), ...remove]) rows.push({ path: name, existed: !!await fs.stat(await targetFor(installer.gameDirectory, name)).catch(() => null) });
    const journalPath = path.join(installer.instance, '.astral-update-journal.json');
    await atomicJSON(journalPath, { id, rows });
    try {
      for (const row of rows) { const target = await targetFor(installer.gameDirectory, row.path); if (row.existed) { const saved = safeDestination(backup, row.path); await fs.mkdir(path.dirname(saved), { recursive: true }); await fs.rename(target, saved); } }
      for (const row of damaged) { const target = await targetFor(installer.gameDirectory, row.path); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.rename(safeDestination(stage, row.path), target); }
      await atomicJSON(cachePath, envelope); await fs.rm(journalPath);
    } catch (e) { await recover(installer); throw e; }
    return result;
  } finally { if (path.resolve(stage).startsWith(path.resolve(stageRoot) + path.sep)) await fs.rm(stage, { recursive: true, force: true }); }
}
module.exports = { repairPack, verifyManifest, fetchEnvelope, recover };
