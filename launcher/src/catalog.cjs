'use strict';
const crypto = require('node:crypto');
const path = require('node:path');
const { readJSON, atomicJSON } = require('./install.cjs');

const ID = /^[a-z0-9][a-z0-9-]{2,63}$/;
const MC = /^1\.\d{1,2}(?:\.\d{1,2})?$/;
const FORGE = /^\d{1,3}(?:\.\d{1,4}){2,3}$/;
const HASH = /^[a-f0-9]{64}$/;
function validCoverImage(value) { return typeof value==='string' && value.length<=180000 && /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(value); }
function appearance(input) {
  if (!input || typeof input !== 'object' || Object.keys(input).some(k=>!['name','description','cover','coverImage','showServer','updatedAt'].includes(k))) throw Error('Можно менять только оформление основной сборки.');
  const result = { name:bounded(input.name,'Название',64), description:bounded(input.description || '', 'Описание',600,0), cover:input.cover || 'citadel', updatedAt:bounded(input.updatedAt || '', 'Обновление',40,0) };
  if (!['citadel','forest'].includes(result.cover)) throw Error('Выберите фон сборки.');
  if (input.coverImage) { if (!validCoverImage(input.coverImage)) throw Error('Выберите изображение обложки заново.'); result.coverImage=input.coverImage; }
  if(input.showServer!==undefined){if(typeof input.showServer!=='boolean')throw Error('Проверьте настройку показа сервера.');result.showServer=input.showServer;}
  return result;
}
function bounded(value, name, max, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) throw Error('Проверьте поле «' + name + '».');
  return value.trim();
}
function driveId(value) {
  let url;
  try { url = new URL(value); } catch { throw Error('Вставьте ссылку на ZIP-файл Google Drive.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com' || url.port || url.username || url.password) throw Error('Нужна HTTPS-ссылка на файл drive.google.com.');
  const id = /^\/file\/d\/([\w-]+)(?:\/|$)/.exec(url.pathname)?.[1] || (['/open','/uc'].includes(url.pathname) ? url.searchParams.get('id') : '');
  if (!/^[\w-]{10,150}$/.test(id || '')) throw Error('Нужна ссылка на файл ZIP, а не на папку Google Drive.');
  return id;
}
function draft(input) {
  if (!input || typeof input !== 'object') throw Error('Заполните данные сборки.');
  const result = {
    name: bounded(input.name, 'Название', 64), version: bounded(input.version, 'Версия сборки', 40),
    description: bounded(input.description || '', 'Описание', 600, 0),
    minecraft: bounded(input.minecraft, 'Minecraft', 20), forge: bounded(input.forge || '', 'Forge', 30, 0),
    driveFileId: driveId(input.driveUrl), cover: input.cover || 'citadel',
    published: input.published !== false,
    serverAddress: bounded(input.serverAddress || '', 'Адрес сервера', 253, 0)
  };
  if (!MC.test(result.minecraft) || (result.forge && !FORGE.test(result.forge))) throw Error('Версии указываются числами, например Minecraft 1.20.1 и Forge 47.4.20.');
  if (!['citadel','forest'].includes(result.cover)) throw Error('Выберите одну из обложек.');
  if (input.coverImage) { if(!validCoverImage(input.coverImage))throw Error('Выберите изображение обложки заново.');result.coverImage=input.coverImage; }
  if(input.showServer!==undefined){if(typeof input.showServer!=='boolean')throw Error('Проверьте настройку показа сервера.');result.showServer=input.showServer;}
  if (result.serverAddress && !/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,251}[a-zA-Z0-9])?)(?::[0-9]{1,5})?$/.test(result.serverAddress)) throw Error('Адрес сервера: IP или домен, при необходимости :порт.');
  if (result.serverAddress.includes(':') && (+result.serverAddress.split(':')[1] < 1 || +result.serverAddress.split(':')[1] > 65535)) throw Error('Порт должен быть от 1 до 65535.');
  return result;
}
function runtimeValid(pack) {
  if (require('./portable-pack.cjs').isPortable(pack)) return require('./portable-pack.cjs').validPortable(pack);
  const j = pack.java, f = pack.forgeInstaller;
  return j && f && /^[\w.+-]{1,100}$/.test(j.version) && /^[\w.+-]{1,100}$/.test(j.folder) && !j.folder.startsWith('.') && !j.version.startsWith('.') &&
    HASH.test(j.sha256) && HASH.test(f.sha256) && Number.isSafeInteger(j.expectedBytes) && j.expectedBytes > 0 && j.expectedBytes < 500 * 1024 ** 2 &&
    Number.isSafeInteger(f.expectedBytes) && f.expectedBytes > 0 && f.expectedBytes < 100 * 1024 ** 2 &&
    /^https:\/\/github\.com\/adoptium\/temurin\d+-binaries\/releases\/download\/[A-Za-z0-9%._+-]+\/[A-Za-z0-9_.+-]+\.zip$/.test(j.url) &&
    f.url === `https://maven.minecraftforge.net/net/minecraftforge/forge/${pack.minecraft}-${pack.forge}/forge-${pack.minecraft}-${pack.forge}-installer.jar`;
}
function normalize(id, value) {
  if (!ID.test(id)) throw Error('Некорректный идентификатор сборки.');
  const info = draft({ ...value, driveUrl: `https://drive.google.com/file/d/${value.driveFileId}/view` });
  if (!FORGE.test(info.forge) || !HASH.test(value.sha256) || !Number.isSafeInteger(value.archiveBytes) || value.archiveBytes <= 0 || value.archiveBytes > 12 * 1024 ** 3 || !Number.isInteger(value.modCount) || value.modCount < 1 || value.modCount > 5000 || !runtimeValid(value)) throw Error('Каталог содержит неполные или небезопасные данные сборки.');
  const prefix = value.archivePrefix || '';
  if (prefix && !/^(?:[\w .()-]+\/){1,3}$/.test(prefix)) throw Error('Некорректная структура архива.');
  if (prefix.split('/').some(p => p === '..' || p === '.')) throw Error('Некорректная структура архива.');
  return { id, ...info, sha256: value.sha256, archiveBytes: value.archiveBytes, modCount: value.modCount,
    archivePrefix: prefix, java: { ...value.java }, forgeInstaller: { ...value.forgeInstaller },
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '' };
}
function encode(value) {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Number.isSafeInteger(value)) return { integerValue: String(value) };
  if (value && typeof value === 'object' && !Array.isArray(value)) return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k,v]) => [k,encode(v)])) } };
  throw Error('Недопустимое значение каталога.');
}
function decode(value) {
  if ('timestampValue' in value) return value.timestampValue;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if (value.mapValue) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k,v]) => [k,decode(v)]));
  return null;
}
class CatalogService {
  constructor(config, auth, directory, fetcher = fetch) {
    this.config = config; this.auth = auth; this.directory = directory; this.fetcher = fetcher;
    this.packs = []; this.builtinAppearance = null; this.admin = false; this.online = false; this.message = ''; this.refreshing = null;
    this.base = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents`;
  }
  async request(suffix, { method = 'GET', body, token, missing = false } = {}) {
    const response = await this.fetcher(this.base + suffix, { method, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type':'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (missing && response.status === 404) return null;
    if(response.status===429){const error=new Error('Firebase временно ограничил запросы (429). Повторите через несколько минут.');error.code='RESOURCE_EXHAUSTED';throw error;}
    if (!response.ok) throw Error(response.status === 403 ? 'Нет доступа к запрошенным данным аккаунта. Обновите вход и повторите.' : 'Сервис недоступен. Проверьте интернет и повторите.');
    return response.json();
  }
  async restore() {
    const cached = await readJSON(path.join(this.directory, 'catalog.json'), []);
    this.packs = (Array.isArray(cached) ? cached : []).flatMap(p => { try { return [normalize(p.id,p)]; } catch { return []; } });
    try { this.builtinAppearance=appearance(await readJSON(path.join(this.directory,'builtin-appearance.json'))); } catch { this.builtinAppearance=null; }
  }
  async checkAdmin() {
    if (this.auth.publicUser()?.status !== 'active') { this.admin = false; return false; }
    try {
      await this.auth.refresh();
      const uid = this.auth.session.uid;
      const doc = await this.request('/launcherAdmins/' + encodeURIComponent(uid), { token: this.auth.session.idToken, missing:true });
      this.admin = this.auth.session?.uid === uid && doc?.fields?.enabled?.booleanValue === true;
    } catch { this.admin = false; }
    return this.admin;
  }
  async requireAdmin() {
    await this.auth.requireAccess();
    if (!await this.checkAdmin()) throw Error('Управление сборками доступно только администратору.');
  }
  async refresh() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.load().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
  async load() {
    if(this.config.publicData&&!this.admin){
      try{
        const {snapshot}=require('./public-data.cjs');
        const [catalog,style]=await Promise.all([snapshot('packs',this.fetcher),snapshot('appearance',this.fetcher)]);
        // An offline bundled snapshot never replaces a newer local catalogue.
        if(catalog.source==='bundled-backup'&&this.packs.length){this.online=false;this.message='Сохранённый каталог';return this.packs;}
        const packs=catalog.documents.map(doc=>normalize(doc.name.split('/').pop(),decode({mapValue:{fields:doc.fields}})));
        const doc=style.documents[0];const appearanceData=doc?appearance(decode({mapValue:{fields:doc.fields}})):null;
        await atomicJSON(path.join(this.directory,'catalog.json'),packs);
        await atomicJSON(path.join(this.directory,'builtin-appearance.json'),appearanceData);
        this.packs=packs;this.builtinAppearance=appearanceData;this.online=true;
        this.message=catalog.source==='bundled-backup'?'Резервный публичный каталог':'Публичный каталог обновлён';return this.packs;
      }catch{this.online=false;this.message='Сохранённый каталог · нет связи с публичным каталогом';return this.packs;}
    }
    try {
      const doc=await this.request('/launcherAppearance/astral',{missing:true});
      this.builtinAppearance=doc ? appearance(decode({mapValue:{fields:doc.fields}})) : null;
      await atomicJSON(path.join(this.directory,'builtin-appearance.json'),this.builtinAppearance);
    } catch { /* Keep the last validated appearance when offline or malformed. */ }
    try {
      let token = '', all = [], pages = 0;
      do {
        const result = await this.request('/launcherPacks?pageSize=100' + (token ? '&pageToken=' + encodeURIComponent(token) : ''));
        all.push(...(result.documents || [])); token = result.nextPageToken || '';
        if (++pages > 20) throw Error('Слишком большой каталог.');
      } while (token);
      let invalid = 0;
      this.packs = all.flatMap(doc => { try { return [normalize(doc.name.split('/').pop(), decode({ mapValue:{ fields:doc.fields } }))]; } catch { invalid++; return []; } });
      this.packs.sort((a,b) => a.name.localeCompare(b.name, 'ru'));
      await atomicJSON(path.join(this.directory, 'catalog.json'), this.packs);
      this.online = true; this.message = invalid ? `Пропущено повреждённых записей: ${invalid}.` : 'Каталог обновлён';
    } catch (error) { this.online = false; this.message = 'Сохранённый каталог · нет связи с Firebase'; }
    return this.packs;
  }
  async publish(id, pack, previousUpdate) {
    await this.requireAdmin();
    id = id || 'pack-' + crypto.randomUUID();
    const normalized = normalize(id, { ...pack, updatedAt:new Date().toISOString() });
    const old = await this.request('/launcherPacks/' + id, { token:this.auth.session.idToken, missing:true });
    if (old && previousUpdate !== decode({mapValue:{fields:old.fields}}).updatedAt) throw Error('Сборку уже изменили. Обновите каталог и откройте редактор снова.');
    const { id: ignored, ...data } = normalized;
    const condition = old ? '?currentDocument.updateTime=' + encodeURIComponent(old.updateTime) : '?currentDocument.exists=false';
    await this.request('/launcherPacks/' + id + condition, { method:'PATCH', token:this.auth.session.idToken, body:{ fields:encode(data).mapValue.fields } });
    await this.refresh();
    return normalized;
  }
  async publishAppearance(input, previousUpdate) {
    await this.requireAdmin();
    const data=appearance({...input,updatedAt:new Date().toISOString()});
    const suffix='/launcherAppearance/astral';
    const old=await this.request(suffix,{token:this.auth.session.idToken,missing:true});
    if(old && previousUpdate!==decode({mapValue:{fields:old.fields}}).updatedAt)throw Error('Оформление уже изменили. Обновите каталог и откройте редактор снова.');
    const condition=old?'?currentDocument.updateTime='+encodeURIComponent(old.updateTime):'?currentDocument.exists=false';
    await this.request(suffix+condition,{method:'PATCH',token:this.auth.session.idToken,body:{fields:encode(data).mapValue.fields}});
    this.builtinAppearance=data;
    await atomicJSON(path.join(this.directory,'builtin-appearance.json'),data);
    return data;
  }
  async remove(id,previousUpdate){
    await this.requireAdmin();
    if(!ID.test(id)||id==='astral')throw Error('Основная встроенная сборка защищена от удаления из каталога.');
    const old=await this.request('/launcherPacks/'+id,{token:this.auth.session.idToken,missing:true});
    if(!old)throw Error('Сборка уже удалена. Обновите каталог.');
    if(previousUpdate!==decode({mapValue:{fields:old.fields}}).updatedAt)throw Error('Сборку уже изменили. Обновите каталог перед удалением.');
    await this.request('/launcherPacks/'+id+'?currentDocument.updateTime='+encodeURIComponent(old.updateTime),{method:'DELETE',token:this.auth.session.idToken});
    await this.refresh();
  }
}
module.exports = { CatalogService, draft, driveId, normalize, encode, decode, runtimeValid, validCoverImage, appearance };
