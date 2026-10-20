'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {readJSON,atomicJSON}=require('./install.cjs');
const {encode,decode,validCoverImage}=require('./catalog.cjs');
const defaults=require('../assets/atmosphere-default.json');
const REMOTE='/launcherThemes/astral';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function text(v,max){if(typeof v!=='string'||v.length>max||/[\x00-\x1f]/.test(v))throw Error('Проверьте текст оформления.');return v;}
function color(v){if(typeof v!=='string'||!/^#[a-f0-9]{6}$/i.test(v))throw Error('Некорректный цвет.');return v;}
function number(v,min,max){if(!Number.isInteger(v)||v<min||v>max)throw Error('Размер или положение выходит за пределы макета 640 × 360.');return v;}
function validate(input){
 if(!input||input.schema!==1||!Array.isArray(input.buttons)||input.buttons.length<2||input.buttons.length>16)throw Error('Неподдерживаемое оформление.');
 const c={schema:1,title:text(input.title,32),subtitle:text(input.subtitle,80),footer:text(input.footer,100),backgroundImage:input.backgroundImage||'',overlay:number(input.overlay,0,90),stars:input.stars===true,titleColor:color(input.titleColor),textColor:color(input.textColor),buttons:[]};
 if(c.backgroundImage&&!validCoverImage(c.backgroundImage))throw Error('Загрузите фон через кнопку выбора изображения.');
 const ids=new Set();
 for(const b of input.buttons){
  if(!/^[a-z][a-z0-9-]{0,39}$/.test(b.id)||ids.has(b.id)||!['play','network','settings','quit','link'].includes(b.action)||!['','globe','discord','telegram','heart'].includes(b.icon)||typeof b.visible!=='boolean')throw Error('Некорректная кнопка.');ids.add(b.id);
  let url='';if(b.action==='link'){let u;try{u=new URL(b.url);}catch{throw Error('Укажите HTTPS-ссылку для кнопки «'+b.label+'».');}if(u.protocol!=='https:'||u.username||u.password||u.href.length>500)throw Error('Для кнопок разрешены только HTTPS-ссылки без пароля.');url=u.href;}
  const row={id:b.id,action:b.action,label:text(b.label,32),url,visible:b.visible,icon:b.icon,x:number(b.x,0,620),y:number(b.y,72,320),width:number(b.width,24,600),height:number(b.height,20,64),color:color(b.color),textColor:color(b.textColor)};
  if(!row.label.trim()||row.x+row.width>640||row.y+row.height>334)throw Error('Кнопка должна помещаться между заголовком и нижней подписью.');
  if(row.visible)for(const other of c.buttons.filter(x=>x.visible))if(row.x<other.x+other.width&&row.x+row.width>other.x&&row.y<other.y+other.height&&row.y+row.height>other.y)throw Error('Кнопки «'+row.label+'» и «'+other.label+'» пересекаются.');
  c.buttons.push(row);
 }
 for(const action of ['play','quit'])if(c.buttons.filter(b=>b.action===action&&b.visible).length!==1)throw Error('Оставьте одну видимую кнопку «'+(action==='play'?'Играть':'Выйти')+'».');
 if(JSON.stringify(c).length>220000)throw Error('Оформление слишком большое.');return c;
}
async function safe(p){const s=await fs.lstat(p).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(s?.isSymbolicLink())throw Error('Папка оформления не должна быть ссылкой.');}
class AtmosphereEditor {
 constructor(catalog,directory,decodeImage){Object.assign(this,{catalog,directory,decodeImage});}
 file(name){return path.join(this.directory,name+'.json');}
 async remote(){const doc=await this.catalog.request(REMOTE,{missing:true});if(!doc)return null;const d=decode({mapValue:{fields:doc.fields}});if(!Number.isSafeInteger(d.revision)||d.revision<1)throw Error('Повреждена версия оформления.');return {config:validate(JSON.parse(d.config)),revision:d.revision,updateTime:doc.updateTime};}
 async open(fresh=false){await this.catalog.requireAdmin();const remote=await this.remote();let saved=await readJSON(this.file('draft'));if(fresh&&saved){await atomicJSON(this.file('draft-previous'),saved);await fs.rm(this.file('draft'),{force:true});saved=null;}return {config:saved?validate(saved.config):remote?.config||structuredClone(defaults),previousUpdate:saved?saved.previousUpdate:remote?.updateTime||'',revision:remote?.revision||0,defaults:structuredClone(defaults),hasDraft:!!saved};}
 async save(input){await this.catalog.requireAdmin();const d={config:validate(input.config),previousUpdate:text(input.previousUpdate||'',100)};await atomicJSON(this.file('draft'),d);return d;}
 async publish(input){await this.catalog.requireAdmin();const config=validate(input.config),remote=await this.remote();if((remote?.updateTime||'')!==(input.previousUpdate||''))throw Error('Другой администратор изменил оформление. Загрузите опубликованную версию.');
  const revision=(remote?.revision||0)+1,condition=remote?'?currentDocument.updateTime='+encodeURIComponent(remote.updateTime):'?currentDocument.exists=false';
  await this.catalog.request(REMOTE+condition,{method:'PATCH',token:this.catalog.auth.session.idToken,body:{fields:encode({config:JSON.stringify(config),revision,updatedAt:new Date().toISOString()}).mapValue.fields}});
  await fs.rm(this.file('draft'),{force:true});return this.open(true);
 }
 async latest(){try{const remote=await this.remote();await atomicJSON(this.file('cache'),remote);return remote;}catch(e){const saved=await readJSON(this.file('cache'));if(saved)return {...saved,config:validate(saved.config),offline:true};return {offline:true,config:null};}}
 async apply(installer){
  if(!require('./client-features.cjs').themed(installer.pack))return {checked:0,repaired:0};
  const remote=await this.latest();if(remote?.offline&&!remote.config){installer.report('verify','Оформление недоступно: сохраняем предыдущий вариант.');return {checked:0,repaired:0};}
  const c=validate(remote?.config||defaults),folder=path.join(installer.gameDirectory,'config','astral-atmosphere');
  for(const p of [installer.instance,installer.gameDirectory,path.join(installer.gameDirectory,'config'),folder])await safe(p);
  await fs.mkdir(folder,{recursive:true});
  const local={...c,revision:remote?.revision||0,backgroundFile:''};delete local.backgroundImage;
  if(c.backgroundImage){const bytes=await this.decodeImage(c.backgroundImage);local.backgroundFile='background-'+hash(bytes)+'.png';const target=path.join(folder,local.backgroundFile);await safe(target);const old=await fs.readFile(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(!old?.equals(bytes))await fs.writeFile(target,bytes);}
  const target=path.join(folder,'appearance.json');await safe(target);await safe(target+'.tmp');const old=await readJSON(target);
  if(JSON.stringify(old)===JSON.stringify(local))return {checked:1,repaired:0};
  if(old){const backup=path.join(folder,'previous.json');await safe(backup);await safe(backup+'.tmp');await atomicJSON(backup,old);}
  // Image is ready before the JSON is replaced; an interrupted write retains the previous layout.
  await atomicJSON(target,local);installer.report('verify','Оформление Minecraft обновлено · версия '+local.revision);return {checked:1,repaired:1};
 }
}
module.exports={AtmosphereEditor,validate,defaults};
