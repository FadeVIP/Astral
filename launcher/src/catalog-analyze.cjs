'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { download } = require('./download.cjs');
const { extractZip } = require('./archive.cjs');
const { draft, normalize } = require('./catalog.cjs');
const { hashFile, atomicJSON } = require('./install.cjs');

async function json(url, signal, fetcher = fetch) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.username || u.password || u.port || !['launchermeta.mojang.com','piston-meta.mojang.com','files.minecraftforge.net','api.adoptium.net'].includes(u.hostname)) throw Error('Неподдерживаемый источник версий.');
  const response = await fetcher(url, { redirect:'error', signal:AbortSignal.any([signal, AbortSignal.timeout(30000)]) });
  if (!response.ok) throw Error('Не удалось получить список версий. Повторите проверку.');
  const text = await response.text();
  if (text.length > 12 * 1024 ** 2) throw Error('Список версий слишком большой.');
  return JSON.parse(text);
}
async function folders(root, depth = 0) {
  const result = [];
  for (const entry of await fs.readdir(root, {withFileTypes:true})) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'mods') result.push(root);
    else if (depth < 3) result.push(...await folders(path.join(root,entry.name), depth+1));
  }
  return result;
}
async function inspectGame(root) {
  const candidates = await folders(root);
  const valid = [];
  for (const candidate of candidates) {
    const mods = (await fs.readdir(path.join(candidate,'mods'))).filter(name => name.toLowerCase().endsWith('.jar'));
    if (mods.length) valid.push({root:candidate, modCount:mods.length});
  }
  if (valid.length !== 1) throw Error(valid.length ? 'В ZIP несколько папок mods. Упакуйте одну клиентскую сборку.' : 'В ZIP нет папки mods с JAR-файлами. Нужен полный архив клиентской сборки, а не экспорт со списком модов.');
  return { archivePrefix:path.relative(root,valid[0].root).split(path.sep).filter(Boolean).join('/') + (valid[0].root === root ? '' : '/'), modCount:valid[0].modCount };
}
async function inventory(root, prefix = '') {
  const files = [];
  for (const entry of await fs.readdir(path.join(root,prefix),{withFileTypes:true})) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await inventory(root,relative + '/'));
    // User settings and saves are deliberately not part of repair.
    else if (entry.isFile() && /^(mods|resourcepacks|shaderpacks)\//.test(relative)) files.push({path:relative,sha256:await hashFile(path.join(root,relative)),bytes:(await fs.stat(path.join(root,relative))).size});
  }
  return files;
}
class PackAnalyzer {
  constructor(directory, report, builtin, dependencies = {}) {
    this.directory = directory; this.report = report; this.builtin = builtin;
    this.download = dependencies.download || download; this.json = dependencies.json || json;
    this.results = new Map();
  }
  async analyze(input, signal) {
    const info = draft(input);
    await fs.mkdir(this.directory,{recursive:true});
    const stage = await fs.mkdtemp(path.join(this.directory,'verify-'));
    const fetchArchive = (url, destination, extra = {}) => this.download({url,destination,signal,...extra,
      onProgress:p => this.report({phase:'download',message:'Проверяем файлы новой сборки…',...p})});
    try {
      const archive = await this.download({driveFileId:info.driveFileId,destination:path.join(stage,'pack.zip'),signal,
        onProgress:p=>this.report({phase:'download',message:'Скачиваем и проверяем ZIP Google Drive…',...p})});
      const content = path.join(stage,'pack');
      await extractZip(path.join(stage,'pack.zip'),content,{signal});
      const inspected = await inspectGame(content);
      const portable=await require('./portable-pack.cjs').inspectPortable(path.join(content,inspected.archivePrefix),info);
      if(portable){
        info.forge=portable.forge;
        const pack=normalize('pack-analysis',{...info,...inspected,...portable,archiveBytes:archive.bytes,sha256:archive.sha256});
        signal.throwIfAborted();const analysisId=crypto.randomUUID();this.results.set(analysisId,{pack,identity:this.identity(info)});while(this.results.size>8)this.results.delete(this.results.keys().next().value);return {analysisId,pack};
      }
      this.report({phase:'prepare',message:'Подбираем совместимые Minecraft, Forge и Java…'});
      const manifest = await this.json('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json',signal);
      const version = manifest.versions.find(v => v.id === info.minecraft && v.type === 'release');
      if (!version) throw Error('Эта стабильная версия Minecraft не найдена. Проверьте номер.');
      const game = await this.json(version.url,signal);
      const major = game.javaVersion?.majorVersion || 8;
      if (!Number.isInteger(major) || major < 8 || major > 30) throw Error('Не удалось определить нужную версию Java.');
      if (!info.forge) {
        const promotions = await this.json('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json',signal);
        info.forge = promotions.promos[info.minecraft+'-recommended'] || promotions.promos[info.minecraft+'-latest'];
        if (!info.forge) throw Error('Forge для этой версии не найден. Укажите его версию вручную.');
      }
      let java;
      if (info.minecraft === this.builtin.minecraft) java = {...this.builtin.java,major};
      else {
        const assets = await this.json(`https://api.adoptium.net/v3/assets/latest/${major}/hotspot?architecture=x64&image_type=jre&os=windows&vendor=eclipse`,signal);
        const asset = assets.find(a => a.binary?.package?.link?.endsWith('.zip'));
        if (!asset) throw Error(`Java ${major} для Windows не найдена. Эту версию пока нельзя опубликовать.`);
        const pkg = asset.binary.package;
        java = {version:asset.release_name.replace(/^jdk-/,''),major,url:pkg.link,sha256:pkg.checksum,expectedBytes:pkg.size};
        const javaZip = path.join(stage,'java.zip');
        await fetchArchive(java.url,javaZip,{sha256:java.sha256,expectedBytes:java.expectedBytes});
        const javaRoot = path.join(stage,'java');
        await extractZip(javaZip,javaRoot,{signal});
        const roots = (await fs.readdir(javaRoot,{withFileTypes:true})).filter(d => d.isDirectory());
        for (const entry of roots) { if (await fs.stat(path.join(javaRoot,entry.name,'bin','java.exe')).catch(()=>null)) java.folder = entry.name; }
        if (!java.folder) throw Error('В архиве Java нет java.exe.');
      }
      const forgeURL = `https://maven.minecraftforge.net/net/minecraftforge/forge/${info.minecraft}-${info.forge}/forge-${info.minecraft}-${info.forge}-installer.jar`;
      const forge = await fetchArchive(forgeURL,path.join(stage,'forge.jar'));
      const forgeRoot = path.join(stage,'forge');
      await extractZip(path.join(stage,'forge.jar'),forgeRoot,{signal});
      const profile = JSON.parse(await fs.readFile(path.join(forgeRoot,'install_profile.json'),'utf8'));
      const declared = profile.minecraft || profile.versionInfo?.inheritsFrom;
      if (declared && declared !== info.minecraft) throw Error('Установщик Forge предназначен для другой версии Minecraft.');
      this.report({phase:'verify',message:'Проверяем структуру и целостность архива…'});
      const pack = normalize('pack-analysis', {...info,...inspected,java,forgeInstaller:{url:forgeURL,sha256:forge.sha256,expectedBytes:forge.bytes},archiveBytes:archive.bytes,sha256:archive.sha256});
      signal.throwIfAborted();
      const analysisId = crypto.randomUUID();
      this.results.set(analysisId,{pack,identity:this.identity(info)});
      while (this.results.size > 8) this.results.delete(this.results.keys().next().value);
      return {analysisId,pack};
    } finally {
      if (path.resolve(stage).startsWith(path.resolve(this.directory)+path.sep)) await fs.rm(stage,{recursive:true,force:true});
    }
  }
  identity(value) { return [value.driveFileId,value.minecraft,value.forge].join('|'); }
  resolve(analysisId, input, previous) {
    const info = draft(input);
    const result = this.results.get(analysisId);
    const pack = result?.pack || previous;
    if (!pack || this.identity(info) !== this.identity(pack)) throw Error('Ссылка или версии изменились. Сначала нажмите «Проверить архив».');
    const {coverImage:previousImage,...base}=pack;
    return {...base,...info};
  }
}
module.exports = { PackAnalyzer, inspectGame, inventory, json };
