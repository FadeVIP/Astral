'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { safeDestination, extractZip } = require('./archive.cjs');
const { hashFile, readJSON } = require('./install.cjs');
async function safeFile(root, relative) {
  const target = safeDestination(root,relative);
  let cursor = path.resolve(root);
  if ((await fs.lstat(cursor)).isSymbolicLink()) throw Error('Папка сборки не должна быть ссылкой.');
  for (const part of relative.split('/')) {
    cursor = path.join(cursor,part);
    const stat = await fs.lstat(cursor).catch(e => {if(e.code !== 'ENOENT') throw e; return null;});
    if (stat?.isSymbolicLink()) throw Error('В папке сборки обнаружена ссылка. Восстановление остановлено.');
  }
  return target;
}
async function repairCatalog(installer,{signal = new AbortController().signal, exclude = new Set()} = {}) {
  const files = await readJSON(path.join(installer.instance,'.catalog-files.json'));
  if (!Array.isArray(files) || !files.length || files.length > 60000) throw Error('Нет списка файлов установленной сборки. Выберите новую папку установки.');
  installer.report('verify','Проверяем моды и ресурсы выбранной сборки…');
  const bad = [];
  for (const file of files) {
    if(exclude.has(file.path.toLowerCase()))continue;
    signal.throwIfAborted();
    if (!/^(mods|resourcepacks|shaderpacks)\//.test(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256)) throw Error('Повреждён список файлов сборки.');
    const target = await safeFile(installer.gameDirectory,file.path);
    if (await hashFile(target,signal).catch(e => {if(e.code !== 'ENOENT') throw e;return '';}) !== file.sha256) bad.push(file);
  }
  if (!bad.length) return {checked:files.length,repaired:0,online:true};
  const zip = await installer.cachedDownload('astral-'+installer.pack.driveFileId+'.zip',{driveFileId:installer.pack.driveFileId,expectedBytes:installer.pack.archiveBytes,sha256:installer.pack.sha256},signal);
  const stagingRoot = path.join(installer.root,'.staging'); await fs.mkdir(stagingRoot,{recursive:true});
  const stage = await fs.mkdtemp(path.join(stagingRoot,'repair-'));
  try {
    await extractZip(zip,stage,{signal,prefix:installer.pack.archivePrefix || '',only:new Set(bad.map(f=>f.path))});
    for (const file of bad) {
      const source = safeDestination(stage,file.path);
      if (await hashFile(source,signal) !== file.sha256) throw Error('Файл в архиве не совпал со списком сборки.');
    }
    for (const file of bad) {
      signal.throwIfAborted();
      const target = await safeFile(installer.gameDirectory,file.path);
      await fs.mkdir(path.dirname(target),{recursive:true});
      // Atomic file replacement leaves unrelated mods and user data in place.
      await fs.rename(safeDestination(stage,file.path),target);
    }
  } finally { if(path.resolve(stage).startsWith(path.resolve(stagingRoot)+path.sep)) await fs.rm(stage,{recursive:true,force:true}); }
  return {checked:files.length,repaired:bad.length,online:true};
}
module.exports = { repairCatalog };
