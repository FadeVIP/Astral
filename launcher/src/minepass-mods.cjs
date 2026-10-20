'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const FILES = ['astral-minepass-0.2.7.jar', 'astral-minepass-ui-0.3.4.jar'];
const NAME = /^astral-minepass(?:-ui)?-\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?\.jar$/i;
function supported(pack) { return (!pack.id || pack.id === 'astral') && pack.minecraft === '1.20.1' && /^47\./.test(pack.forge); }
function owns(relative) { return /^mods\/[^/]+$/i.test(relative) && NAME.test(relative.slice(5)); }
async function safe(target) {
  const stat = await fs.lstat(target).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
  if (stat?.isSymbolicLink()) throw Error('Путь MinePass не должен быть ссылкой: ' + path.basename(target));
  return stat;
}
async function repair(installer) {
  if (!supported(installer.pack)) return { checked: 0, repaired: 0, removed: 0 };
  const folder = path.join(installer.gameDirectory, 'mods');
  const backups = path.join(installer.instance, '.minepass-backups');
  for (const target of [installer.instance, installer.gameDirectory, folder, backups]) await safe(target);
  // Read both bundled files before changing the installation. A failed repair
  // prevents launch; retrying completes any interrupted pair update.
  const sources = await Promise.all(FILES.map(name => fs.readFile(path.join(__dirname, '../assets/client-mods', name))));
  await fs.mkdir(folder, { recursive: true });
  const names = (await fs.readdir(folder)).filter(name => NAME.test(name));
  for (const name of names) {
    const stat = await safe(path.join(folder, name));
    if (!stat?.isFile()) throw Error('Вместо мода MinePass обнаружена папка: ' + name);
  }
  async function backup(name, bytes) {
    await fs.mkdir(backups, { recursive: true });
    const target = path.join(backups, crypto.createHash('sha256').update(bytes).digest('hex') + '-' + name);
    await safe(target);
    await fs.writeFile(target, bytes);
  }
  let repaired = 0, removed = 0;
  for (let i = 0; i < FILES.length; i++) {
    const name = FILES[i], target = path.join(folder, name), bytes = sources[i];
    const previous = await fs.readFile(target).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
    if (previous?.equals(bytes)) continue;
    if (previous) await backup(name, previous);
    const temporary = target + '.' + crypto.randomUUID() + '.tmp';
    try { await fs.writeFile(temporary, bytes); await fs.rename(temporary, target); }
    finally { await fs.rm(temporary, { force: true }); }
    repaired++;
  }
  // Retire older versions only after both replacements are installed.
  for (const name of names.filter(name => !FILES.some(current => current.toLowerCase() === name.toLowerCase()))) {
    const target = path.join(folder, name);
    await backup(name, await fs.readFile(target));
    await fs.unlink(target);
    removed++;
  }
  if (repaired || removed) installer.report('verify', 'MinePass и его интерфейс обновлены. Старые версии сохранены в резервной копии.');
  return { checked: FILES.length, repaired, removed };
}
module.exports = { FILES, supported, owns, repair };
