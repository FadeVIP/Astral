'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { download } = require('./download.cjs');
const { extractZip } = require('./archive.cjs');

async function atomicJSON(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file + '.tmp', JSON.stringify(value, null, 2));
  await fsp.rename(file + '.tmp', file);
}
async function readJSON(file, fallback = null) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return fallback; throw error; }
}
async function hashFile(file, signal) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) { signal?.throwIfAborted(); hash.update(chunk); }
  return hash.digest('hex');
}
class Installer {
  constructor(root, pack, onProgress = () => {}, dependencies = {}) {
    this.root = path.resolve(root);
    this.pack = pack;
    this.onProgress = onProgress;
    this.download = dependencies.download || download;
    this.extract = dependencies.extract || extractZip;
    this.id = 'astral-' + crypto.createHash('sha256').update(require('./pack-base.cjs').identity(pack)).digest('hex').slice(0, 12);
    this.instance = path.join(this.root, 'instances', this.id);
    this.gameDirectory = path.join(this.instance, 'minecraft');
    this.runtime = path.join(this.root, 'runtime', pack.java.version);
    this.javaPath = path.join(this.runtime, pack.java.folder, 'bin', 'java.exe');
    this.forgePath = path.join(this.root, 'downloads', `forge-${pack.minecraft}-${pack.forge}.jar`);
    this.portable = require('./portable-pack.cjs').isPortable(pack);
    if(this.portable){this.javaPath=path.join(this.gameDirectory,'runtime','bin','java.exe');this.forgePath=path.join(this.gameDirectory,'client.jar');}
  }
  async installed() {
    const record = await readJSON(path.join(this.instance, '.astral-install.json'));
    return !!(record && record.driveFileId === this.pack.driveFileId &&
      fs.existsSync(path.join(this.gameDirectory, 'mods')) && fs.existsSync(this.javaPath) && fs.existsSync(this.forgePath));
  }
  report(phase, message, extra = {}) { this.onProgress({ phase, message, ...extra }); }
  async cachedDownload(name, options, signal) {
    const cache = path.join(this.root, 'downloads');
    const target = path.join(cache, name);
    const record = await readJSON(target + '.json');
    if (record && fs.existsSync(target)) {
      this.report('verify', 'Проверяем ранее скачанный архив…');
      const stat = await fsp.stat(target);
      if ((!options.expectedBytes || stat.size === options.expectedBytes) && await hashFile(target, signal) === (options.sha256 || record.sha256)) return target;
      await fsp.rm(target, { force: true });
    }
    // A prior interrupted write cannot be mistaken for a complete archive.
    if (fs.existsSync(target)) await fsp.rm(target, { force: true });
    const recordNew = await this.download({ ...options, destination: target, signal, onProgress: progress => this.report('download', options.driveFileId ? 'Скачиваем сборку с Google Drive' : 'Подготавливаем Java и Forge', progress) });
    await atomicJSON(target + '.json', recordNew);
    return target;
  }
  async install(ramMB, signal) {
    if (await this.installed()) return;
    await fsp.mkdir(this.root, { recursive: true });
    const space = await fsp.statfs(this.root);
    if (Number(space.bavail) * Number(space.bsize) < this.pack.archiveBytes * 3 + 2 * 1024 ** 3) throw new Error('Недостаточно места: освободите хотя бы 6 ГБ для установки.');
    const stagingRoot = path.join(this.root, '.staging');
    await fsp.mkdir(stagingRoot, { recursive: true });
    const stage = await fsp.mkdtemp(path.join(stagingRoot, 'install-'));
    try {
      if (!this.portable && !fs.existsSync(this.javaPath)) {
        const javaZip = await this.cachedDownload('java-' + this.pack.java.version + '.zip', this.pack.java, signal);
        this.report('extract', `Устанавливаем Java ${this.pack.java.major || 17}…`);
        const javaStage = path.join(stage, 'java');
        await this.extract(javaZip, javaStage, { signal });
        if (!fs.existsSync(path.join(javaStage, this.pack.java.folder, 'bin', 'java.exe'))) throw new Error('В архиве Java отсутствует приложение.');
        await fsp.mkdir(path.dirname(this.runtime), { recursive: true });
        if (fs.existsSync(this.runtime)) throw new Error('Найдена неполная папка Java. Выберите новую папку установки.');
        signal.throwIfAborted();
        await fsp.rename(javaStage, this.runtime);
      }
      if(!this.portable) await this.cachedDownload(`forge-${this.pack.minecraft}-${this.pack.forge}.jar`, this.pack.forgeInstaller, signal);
      const zip = await this.cachedDownload('astral-' + this.pack.driveFileId + '.zip', {
        driveFileId: this.pack.driveFileId, expectedBytes: this.pack.archiveBytes, sha256: this.pack.sha256
      }, signal);
      const instanceStage = path.join(stage, 'instance');
      const gameStage = path.join(instanceStage, 'minecraft');
      this.report('extract', 'Устанавливаем моды и ресурсы…');
      await this.extract(zip, gameStage, { signal, prefix: this.pack.archivePrefix || '', onProgress: ({ count, total }) => this.report('extract', 'Устанавливаем моды и ресурсы…', { count, totalFiles: total }) });
      const mods = await fsp.readdir(path.join(gameStage, 'mods')).catch(() => []);
      if (!mods.some(name => name.endsWith('.jar'))) throw new Error('В архиве нет папки mods с модами. Установка остановлена.');
      if(this.portable){const p=await require('./portable-pack.cjs').inspectPortable(gameStage,this.pack);if(!p||p.java.sha256!==this.pack.java.sha256||p.forgeInstaller.sha256!==this.pack.forgeInstaller.sha256)throw Error('Комплектные Java и клиент не соответствуют проверенному архиву.');}
      await atomicJSON(path.join(instanceStage, '.astral-install.json'), { driveFileId: this.pack.driveFileId, version: this.pack.version, installedAt: new Date().toISOString(), mods: mods.filter(f => f.endsWith('.jar')).length });
      if (!require('./pack-base.cjs').isOriginal(this.pack)) await atomicJSON(path.join(instanceStage, '.catalog-files.json'), await require('./catalog-analyze.cjs').inventory(gameStage));
      // Each release receives its own instance: never replace worlds/configs in an existing one.
      await fsp.mkdir(path.dirname(this.instance), { recursive: true });
      if (fs.existsSync(this.instance)) throw new Error('Папка этой версии уже существует. Она сохранена без изменений; выберите новую папку установки.');
      signal.throwIfAborted();
      await fsp.rename(instanceStage, this.instance);
      this.report('ready', 'Сборка установлена. Можно играть.');
    } finally {
      // The directory is created by mkdtemp and checked before recursive removal.
      if (path.resolve(stage).startsWith(path.resolve(stagingRoot) + path.sep)) await fsp.rm(stage, { recursive: true, force: true });
    }
  }
  async setMemory(ramMB) {
    if (!Number.isInteger(ramMB) || ramMB < 4096 || ramMB > 32768) throw new Error('Выберите от 4 до 32 ГБ памяти.');
  }
}
module.exports = { Installer, readJSON, atomicJSON, hashFile };
