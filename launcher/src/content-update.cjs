'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {safeDestination}=require('./archive.cjs');
const {hashFile,readJSON,atomicJSON}=require('./install.cjs');
const {download}=require('./download.cjs');
const {encode,decode,driveId}=require('./catalog.cjs');
const ID=/^[a-z0-9][a-z0-9-]{2,63}$/;
const ROOTS=['mods','config','defaultconfigs','resourcepacks','shaderpacks','scripts','kubejs','fancymenu_data'];
function validPath(p){
 if(p==='options.txt')return p;
 if(typeof p!=='string'||p.length>240||!ROOTS.includes(p.split('/')[0])||p.split('/').length<2||/[<>"|?*]/.test(p))throw Error('Выберите файл внутри mods, config, resourcepacks, shaderpacks или scripts.');
 safeDestination(path.resolve('validate'),p);
 if(/\.(exe|dll|bat|cmd|ps1|vbs|lnk|com|scr)$/i.test(p))throw Error('Программы Windows нельзя включать в обновление сборки.');
 return p;
}
function validate(m,pack){
 if(!m||m.schema!==1||m.packId!==pack.id||m.baseSha256!==pack.sha256||m.minecraft!==pack.minecraft||m.forge!==pack.forge||!Number.isSafeInteger(m.revision)||m.revision<1||!Array.isArray(m.files)||!Array.isArray(m.remove)||m.files.length+m.remove.length>2000||typeof m.version!=='string'||!m.version.trim()||m.version.length>40)throw Error('Обновление не подходит к этой сборке.');
 if(m.archivedFiles!==undefined){if(!Array.isArray(m.archivedFiles)||m.archivedFiles.length+m.files.length+m.remove.length>4000)throw Error('Некорректная история файлов.');validate({...m,archivedFiles:undefined,files:m.archivedFiles,remove:[]},pack);}
 const seen=new Set();
 for(const row of m.files){validPath(row.path);if(!(row.source==='modrinth'?require('./modrinth.cjs').validRow(row):/^[\w-]{10,150}$/.test(row.driveFileId))||!/^[a-f0-9]{64}$/.test(row.sha256)||!Number.isSafeInteger(row.bytes)||row.bytes<0||row.bytes>1024**3)throw Error('Некорректный файл обновления.');if(seen.has(row.path.toLowerCase()))throw Error('Повторяющийся путь файла.');seen.add(row.path.toLowerCase());}
 for(const p of m.remove){validPath(p);if(p==='options.txt')throw Error('options.txt можно заменить, но нельзя удалить у игроков.');if(seen.has(p.toLowerCase()))throw Error('Файл одновременно добавляется и удаляется.');seen.add(p.toLowerCase());}
 if(JSON.stringify(m).length>650000)throw Error('Слишком большой список обновления.');
 return m;
}
async function safeFile(root,p){validPath(p);let current=path.resolve(root);for(const part of [null,...p.split('/')]){if(part)current=path.join(current,part);const s=await fs.lstat(current).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(s?.isSymbolicLink())throw Error('В папке обновления обнаружена ссылка.');}return safeDestination(root,p);}
async function recoverContent(installer){
 const file=path.join(installer.instance,'.content-journal.json'),j=await readJSON(file);if(!j)return;
 if(!/^[a-f0-9-]{36}$/.test(j.id)||!Array.isArray(j.rows))throw Error('Повреждён журнал обновления.');
 const backup=path.join(installer.instance,'.content-backups',j.id);
 for(const row of [...j.rows].reverse()){const target=await safeFile(installer.gameDirectory,row.path),saved=await safeFile(backup,row.path);if(await fs.stat(saved).catch(()=>null)){await fs.mkdir(path.dirname(target),{recursive:true});await fs.rm(target,{force:true});await fs.rename(saved,target);}else if(!row.existed)await fs.rm(target,{force:true});}
 await fs.rm(file);
}
async function applyContent(installer,manifest,{signal=new AbortController().signal,downloader=download}={}){
 await recoverContent(installer);if(!manifest)return {checked:0,repaired:0,removed:0};validate(manifest,installer.pack);
 const appliedState=await readJSON(path.join(installer.instance,'.content-installed.json'),{});
 const rootFiles={...(appliedState.rootFiles||{})};
 const damaged=[],remove=[];
 for(const row of manifest.files){signal.throwIfAborted();const target=await safeFile(installer.gameDirectory,row.path);if(row.path==='options.txt'&&rootFiles[row.path]===row.sha256&&await fs.stat(target).catch(()=>null))continue;if(await hashFile(target,signal).catch(e=>{if(e.code==='ENOENT')return '';throw e;})!==row.sha256)damaged.push(row);}
 for(const p of manifest.remove){const target=await safeFile(installer.gameDirectory,p);const s=await fs.stat(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(s){if(!s.isFile())throw Error('Нельзя удалить папку вместо файла: '+p);remove.push(p);}}
 const stage=await fs.mkdtemp(path.join(installer.instance,'.content-stage-'));
 try{
  for(const row of damaged){signal.throwIfAborted();installer.report('download','Обновляем '+row.path);await downloader({...(row.source==='modrinth'?{url:row.url}:{driveFileId:row.driveFileId}),destination:safeDestination(stage,row.path),expectedBytes:row.bytes,sha256:row.sha256,format:/\.(jar|zip)$/i.test(row.path)?'zip':'data',allowEmpty:row.bytes===0,signal});}
  signal.throwIfAborted();const id=crypto.randomUUID(),backup=path.join(installer.instance,'.content-backups',id),rows=[];
  for(const p of [...damaged.map(r=>r.path),...remove])rows.push({path:p,existed:!!await fs.stat(await safeFile(installer.gameDirectory,p)).catch(()=>null)});
  if(rows.length){const journal=path.join(installer.instance,'.content-journal.json');await atomicJSON(journal,{id,rows});try{
   for(const row of rows)if(row.existed){const saved=await safeFile(backup,row.path);await fs.mkdir(path.dirname(saved),{recursive:true});await fs.rename(await safeFile(installer.gameDirectory,row.path),saved);}
   for(const row of damaged){const target=await safeFile(installer.gameDirectory,row.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.rename(safeDestination(stage,row.path),target);}
   await atomicJSON(path.join(backup,'changes.json'),{id,rows,at:new Date().toISOString(),revision:manifest.revision,version:manifest.version});
   const history=await readJSON(path.join(installer.instance,'.update-history.json'),[]);await atomicJSON(path.join(installer.instance,'.update-history.json'),[{at:new Date().toISOString(),version:manifest.version,revision:manifest.revision,added:rows.filter(r=>!r.existed).map(r=>r.path),replaced:damaged.filter(r=>rows.some(x=>x.path===r.path&&x.existed)).map(r=>r.path),removed:remove},...history].slice(0,100));
   await fs.rm(journal);
  }catch(e){await recoverContent(installer);throw e;}}
  for(const row of manifest.files)if(row.path==='options.txt')rootFiles[row.path]=row.sha256;
  await atomicJSON(path.join(installer.instance,'.content-installed.json'),{revision:manifest.revision,version:manifest.version,rootFiles});
  return {checked:manifest.files.length,repaired:damaged.length,removed:remove.length};
 }finally{if(path.dirname(stage)===path.resolve(installer.instance))await fs.rm(stage,{recursive:true,force:true});}
}
function removedSources(input,previous){
 const removed=new Set(input.remove.map(p=>p.toLowerCase())),known=new Map();
 for(const row of [...(previous?.archivedFiles||[]),...(previous?.files||[]),...(input.archivedFiles||[])])if(removed.has(row.path.toLowerCase()))known.set(row.path.toLowerCase(),row);
 return [...known.values()];
}
class ContentService{
 constructor(catalog,directory,report,dependencies={}){this.catalog=catalog;this.directory=directory;this.report=report;this.fetcher=dependencies.fetcher||fetch;this.downloader=dependencies.downloader||download;}
 key(pack){if(!ID.test(pack.id))throw Error('Некорректная сборка.');const base=pack.id==='astral'&&!require('./pack-base.cjs').isOriginal(pack)?crypto.createHash('sha256').update([pack.sha256,pack.minecraft,pack.forge].join('|')).digest('hex'):pack.sha256;return pack.id+'-'+base.slice(0,16);}
 file(pack,suffix){return path.join(this.directory,this.key(pack)+suffix+'.json');}
 async remote(pack){const doc=await this.catalog.request('/launcherContent/'+this.key(pack),{missing:true});return doc?{manifest:validate(JSON.parse(decode({mapValue:{fields:doc.fields}}).manifest),pack),updateTime:doc.updateTime}:null;}
 async latest(pack){try{const remote=await this.remote(pack);await atomicJSON(this.file(pack,'-cache'),remote);return remote?.manifest||null;}catch(e){const cached=await readJSON(this.file(pack,'-cache'));if(cached)return validate(cached.manifest,pack);throw Error('Не удалось проверить опубликованные изменения сборки. Повторите при доступном интернете.');}}
 async open(pack,fresh=false){await this.catalog.requireAdmin();const remote=await this.remote(pack),saved=await readJSON(this.file(pack,'-draft'));if(saved&&saved.baseSha256===pack.sha256&&!fresh)return {...saved,remoteRevision:remote?.manifest.revision||0};const m=remote?.manifest;const d={packId:pack.id,baseSha256:pack.sha256,version:m?.version||pack.version,files:m?.files||[],remove:m?.remove||[],archivedFiles:m?.archivedFiles||[],previousUpdate:remote?.updateTime||'',remoteRevision:m?.revision||0};if(fresh){if(saved)await atomicJSON(this.file(pack,'-draft-backup'),saved);await atomicJSON(this.file(pack,'-draft'),d);}return d;}
 async save(pack,input){await this.catalog.requireAdmin();const d={packId:pack.id,baseSha256:pack.sha256,version:input.version,files:input.files,remove:input.remove,archivedFiles:input.archivedFiles||[],previousUpdate:input.previousUpdate||'',remoteRevision:input.remoteRevision||0};validate({...d,schema:1,minecraft:pack.minecraft,forge:pack.forge,revision:1},pack);await atomicJSON(this.file(pack,'-draft'),d);return d;}
 async importFile(url,target,signal){await this.catalog.requireAdmin();validPath(target);const id=driveId(url);await fs.mkdir(this.directory,{recursive:true});const stage=await fs.mkdtemp(path.join(this.directory,'import-'));try{const result=await this.downloader({driveFileId:id,destination:path.join(stage,'file'),format:target.endsWith('.jar')?'zip':'data',allowEmpty:true,signal,onProgress:p=>this.report({phase:'download',message:'Проверяем '+target,...p})});if(result.bytes>1024**3)throw Error('Файл больше 1 ГБ.');return {path:target,driveFileId:id,sha256:result.sha256,bytes:result.bytes};}finally{await fs.rm(stage,{recursive:true,force:true});}}
 async verifyDirect(row,signal){if(!require('./modrinth.cjs').validRow(row))throw Error('Недопустимый файл каталога.');await fs.mkdir(this.directory,{recursive:true});const stage=await fs.mkdtemp(path.join(this.directory,'verify-catalog-'));try{await this.downloader({url:row.url,destination:path.join(stage,'file'),expectedBytes:row.bytes,sha256:row.sha256,format:'zip',signal});}finally{await fs.rm(stage,{recursive:true,force:true});}}
 async importFolder(url,prefix,apiKey,signal){
  await this.catalog.requireAdmin();let u;try{u=new URL(url);}catch{throw Error('Вставьте ссылку на папку Google Drive.');}const id=/^\/drive\/(?:u\/\d+\/)?folders\/([\w-]{10,150})(?:\/|$)/.exec(u.pathname)?.[1];if(u.protocol!=='https:'||u.hostname!=='drive.google.com'||u.username||u.password||!id)throw Error('Нужна ссылка на папку drive.google.com/drive/folders/…');
  if(!ROOTS.includes(prefix)&&prefix!=='')throw Error('Выберите папку назначения.');if(!/^AIza[\w-]{30,60}$/.test(apiKey||''))throw Error('Добавьте ключ Google Drive API в настройке импорта.');
  const rows=[],visited=new Set();let requests=0;
  const scan=async(folder,relative,depth)=>{if(depth>8||visited.has(folder))throw Error('Слишком глубокая или повторяющаяся папка.');visited.add(folder);let page='';do{signal.throwIfAborted();if(++requests>100)throw Error('Слишком большая папка.');const endpoint=new URL('https://www.googleapis.com/drive/v3/files');endpoint.search=new URLSearchParams({key:apiKey,q:`'${folder}' in parents and trashed = false`,pageSize:'100',fields:'nextPageToken,incompleteSearch,files(id,name,mimeType,size)',...(page?{pageToken:page}:{})}).toString();const response=await this.fetcher(endpoint,{redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});if(!response.ok)throw Error('Drive API недоступен. Проверьте ключ, включение API и доступ «Все, у кого есть ссылка».');const data=await response.json();if(data.incompleteSearch)throw Error('Google Drive вернул неполный список. Импорт отменён.');for(const f of data.files||[]){if(!/^[\w-]{10,150}$/.test(f.id)||typeof f.name!=='string'||/[\\/]/.test(f.name))throw Error('Некорректный файл в папке Drive.');const p=relative?relative+'/'+f.name:f.name;if(f.mimeType==='application/vnd.google-apps.folder'){safeDestination(path.resolve('validate'),p);await scan(f.id,p,depth+1);}else {if(f.mimeType.startsWith('application/vnd.google-apps.'))throw Error('Документы и ярлыки Google не являются файлами сборки.');validPath(p);if(rows.length>=2000)throw Error('В обновлении максимум 2000 файлов.');rows.push({path:p,driveFileId:f.id});}}page=data.nextPageToken||'';}while(page);};
  await scan(id,prefix,0);const seen=new Set();for(const r of rows){if(seen.has(r.path.toLowerCase()))throw Error('В Drive есть файлы с одинаковым именем.');seen.add(r.path.toLowerCase());}
  const result=[];for(const row of rows)result.push(await this.importFile(`https://drive.google.com/file/d/${row.driveFileId}/view`,row.path,signal));return result;
 }
 async publish(pack,input,signal){await this.catalog.requireAdmin();const remote=await this.remote(pack);if((remote?.updateTime||'')!==(input.previousUpdate||''))throw Error('Другой администратор уже опубликовал обновление. Откройте актуальную версию заново.');const m=validate({schema:1,packId:pack.id,baseSha256:pack.sha256,minecraft:pack.minecraft,forge:pack.forge,revision:(remote?.manifest.revision||0)+1,version:input.version,files:input.files,remove:input.remove,archivedFiles:removedSources(input,remote?.manifest)},pack);
  // Verify availability and contents again immediately before publication.
  for(const row of m.files){if(row.source==='modrinth'){await this.verifyDirect(row,signal);continue;}const actual=await this.importFile(`https://drive.google.com/file/d/${row.driveFileId}/view`,row.path,signal);if(actual.sha256!==row.sha256||actual.bytes!==row.bytes)throw Error('Файл изменился на Google Drive. Импортируйте его заново: '+row.path);}
  await this.catalog.requireAdmin();signal.throwIfAborted();const condition=remote?'?currentDocument.updateTime='+encodeURIComponent(remote.updateTime):'?currentDocument.exists=false';await this.catalog.request('/launcherContent/'+this.key(pack)+condition,{method:'PATCH',token:this.catalog.auth.session.idToken,body:{fields:encode({manifest:JSON.stringify(m),revision:m.revision,updatedAt:new Date().toISOString()}).mapValue.fields}});await fs.rm(this.file(pack,'-draft'),{force:true});return this.open(pack);
 }
}
async function rollbackContent(installer){
 await recoverContent(installer);const dir=path.join(installer.instance,'.content-backups');
 const candidates=[];for(const id of await fs.readdir(dir).catch(e=>{if(e.code==='ENOENT')return [];throw e;})){if(!/^[a-f0-9-]{36}$/.test(id))continue;const m=await readJSON(path.join(dir,id,'changes.json'));if(m&&m.id===id&&Number.isSafeInteger(m.revision)&&Array.isArray(m.rows)&&m.rows.length<=2000)candidates.push({...m,at:m.at||(await fs.stat(path.join(dir,id,'changes.json'))).mtime.toISOString()});}
 candidates.sort((a,b)=>String(b.at).localeCompare(String(a.at)));const selected=candidates[0];if(!selected)throw Error('Нет сохранённой версии файлов для возврата.');
 const pinned=await readJSON(path.join(installer.instance,'.updates-paused.json'));if(pinned)throw Error('Уже выполнен возврат. Сначала возобновите обновления.');
 const id=crypto.randomUUID(),backup=path.join(dir,id),rows=[];
 for(const row of selected.rows){const target=await safeFile(installer.gameDirectory,row.path);if(row.existed&&!await fs.stat(await safeFile(path.join(dir,selected.id),row.path)).catch(()=>null))throw Error('Резервный файл не найден: '+row.path);rows.push({path:row.path,existed:!!await fs.stat(target).catch(()=>null)});}
 const journal=path.join(installer.instance,'.content-journal.json');await atomicJSON(journal,{id,rows});
 try{for(const row of rows){const target=await safeFile(installer.gameDirectory,row.path);if(row.existed){const saved=await safeFile(backup,row.path);await fs.mkdir(path.dirname(saved),{recursive:true});await fs.rename(target,saved);}}
 for(const row of selected.rows)if(row.existed){const target=await safeFile(installer.gameDirectory,row.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(await safeFile(path.join(dir,selected.id),row.path),target);}
 await atomicJSON(path.join(installer.instance,'.updates-paused.json'),{revision:selected.revision,at:new Date().toISOString()});await fs.rm(journal);return selected;
 }catch(e){await recoverContent(installer);throw e;}
}
module.exports={ContentService,validate,validPath,safeFile,applyContent,recoverContent,rollbackContent,ROOTS};
