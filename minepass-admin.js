import {initCosmeticsAdmin} from '/cosmetics-admin.js?v=1';
import {initAcoin} from '/acoin-admin.js?v=1';
import {loadSecretWinner} from '/easter-egg-admin.js?v=20261020-8';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,signInWithEmailAndPassword,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,doc,getDoc,runTransaction} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-lite.js';
const $=id=>document.getElementById(id),schema=window.MinePassSchema,app=initializeApp(window.__FROSTBORNE_FIREBASE_CONFIG__),auth=getAuth(app),db=getFirestore(app),ref=doc(db,'minepassConfig','astral-local');
let config,baseline,revision=0,dirty=false,catalog={items:[],quests:[]},userId;
const rarity={common:'Обычный',rare:'Редкий',epic:'Легендарный'},colors={blue:'#4b90ff',purple:'#8847ff',pink:'#d86bdb',red:'#eb4b4b',gold:'#ffd700'};
const message=text=>$('status').textContent=text;
function changed(){dirty=true;$('revision').textContent=`Публикация №${revision} · Есть неопубликованные изменения`;}
function fail(e){const errors={'permission-denied':'Доступ запрещён. Нужен активный аккаунт администратора Astral.','auth/invalid-credential':'Неверный email или пароль. Используйте аккаунт Astral.','auth/wrong-password':'Неверный email или пароль.','auth/invalid-email':'Проверьте адрес email.','auth/network-request-failed':'Нет связи с Firebase. Проверьте интернет или VPN и повторите вход.','auth/too-many-requests':'Слишком много попыток. Подождите немного перед повторным входом.','auth/user-disabled':'Аккаунт отключён.'};message(errors[e.code]||((e.code?'Ошибка '+e.code+': ':'')+(e.message||'Не удалось выполнить запрос. Повторите попытку.')));}
function deadline(promise,label,ms=18000){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' не ответил за 18 секунд. Проверьте интернет/VPN и нажмите «Повторить загрузку».')),ms);})]).finally(()=>clearTimeout(timer));}
async function readJSON(url){const response=await deadline(fetch(url,{cache:'no-cache'}),'Сайт');if(!response.ok)throw Error('Не удалось загрузить данные сайта: HTTP '+response.status);return response.json();}
function field(container,title,obj,key,{options,list,min,max,locked=false}={}){const label=document.createElement('label');label.textContent=title;const el=document.createElement(options?'select':'input');if(options)for(const [value,text]of Object.entries(options)){const o=document.createElement('option');o.value=value;o.textContent=text;el.append(o);}else if(typeof obj[key]==='number'){el.type='number';el.min=min??0;el.max=max??100000;el.step=1;}else el.type='text';if(list)el.setAttribute('list',list);el.value=obj[key]??'';el.disabled=locked;el.addEventListener('change',()=>{obj[key]=el.type==='number'?Number(el.value):el.value.trim();changed();if(key==='weight'||key==='tier')renderLoot();});label.append(el);container.append(label);return el;}
function card(title){const root=document.createElement('article');root.className='card';const h=document.createElement('h3');h.textContent=title;root.append(h);const fields=document.createElement('div');fields.className='fields';root.append(fields);return{root,fields};}
function removeButton(root,fn){const b=document.createElement('button');b.className='delete';b.textContent='Удалить из настроек';b.onclick=()=>{fn();changed();};root.append(b);}
function renderLoot(){const key=$('chest').value,rows=config.chests[key],sum=rows.reduce((n,r)=>n+r.weight,0);$('loot-list').replaceChildren();for(const r of rows){const {root,fields}=card(r.label);root.style.setProperty('--tier',colors[r.tier]);field(fields,'Название награды',r,'label');field(fields,'Предмет — название или ID',r,'item',{list:'items'}).addEventListener('change',()=>{const found=catalog.items.find(x=>x.id===r.item||x.name===r.item);if(found)r.item=found.id;});field(fields,'Количество',r,'count',{min:1,max:64});field(fields,'Редкость оформления',r,'tier',{options:{blue:'Синяя',purple:'Фиолетовая',pink:'Розовая',red:'Красная',gold:'Золотая'}});field(fields,'Вес выпадения',r,'weight',{min:1,max:100000});field(fields,'Дополнительно монет',r,'coins',{max:100000});field(fields,'Дополнительно очков',r,'points',{max:10000});field(fields,'Дополнительно ключи',r,'key',{options:{'':'Без ключей',...rarity}});const chance=document.createElement('p');chance.className='chance';chance.textContent=`Шанс: ${sum>0?(r.weight/sum*100).toFixed(2):'—'} %`;root.append(chance);removeButton(root,()=>{rows.splice(rows.indexOf(r),1);renderLoot();});$('loot-list').append(root);}}
function renderQuests(){const term=$('search').value.toLowerCase();$('quest-list').replaceChildren();for(const q of config.quests.filter(q=>(q.title+' '+q.target).toLowerCase().includes(term))){const {root,fields}=card(q.title),locked=!!baseline.quests.find(x=>x.id===q.id);field(fields,'Название',q,'title');field(fields,'Очки и монеты',q,'points',{min:1,max:10000});field(fields,'Сундук в награду',q,'key',{options:rarity});field(fields,'Тип задания',q,'kind',{locked,options:{kill:'Победить существо',craft:'Создать предмет',fish:'Поймать предмет',dimension:'Посетить измерение',external:'Выполнить FTB Quests'}}).addEventListener('change',()=>{if(q.kind==='external'){q.target='ftbquests:';q.goal=1;}renderQuests();});field(fields,q.kind==='external'?'FTB ID (16 символов)':'ID предмета, существа или измерения',q,'target',{locked,list:q.kind==='external'?'ftb':'items'});field(fields,'Необходимое количество',q,'goal',{min:1,max:100000,locked:locked||q.kind==='external'});if(locked){const tip=document.createElement('p');tip.textContent='Условие опубликовано. Для другого условия добавьте новое задание — так сохранённый прогресс останется корректным.';root.append(tip);}removeButton(root,()=>{config.quests.splice(config.quests.indexOf(q),1);renderQuests();});$('quest-list').append(root);}}
function lists(){for(const [id,rows]of [['items',catalog.items],['ftb',catalog.quests]]){$(id).replaceChildren();for(const row of rows){const o=document.createElement('option');o.value=id==='ftb'?'ftbquests:'+row.id:row.id;o.label=row.name;$(id).append(o);}}}
let eventView='active',renderedEventPhases='';
const eventPhase=e=>!e.runId?'draft':Date.now()>=e.endsAt?'ended':Date.now()<e.startsAt?'scheduled':'active';
const eventDate=t=>new Date(t).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
function eventHistory(){const rows=[...(config.eventHistory||[])];for(const e of config.events)if(eventPhase(e)==='ended'&&!rows.some(h=>h.event.runId===e.runId))rows.push({event:e,archivedAt:e.endsAt,reason:'ended'});return rows.sort((a,b)=>b.archivedAt-a.archivedAt);}
function repeatEvent(event){const copy=structuredClone(event);copy.id=newId();copy.runId='';copy.startsAt=0;copy.endsAt=0;config.events.unshift(copy);eventView='draft';changed();renderEvents();message('Создана копия с прежними условиями и наградами. Выберите дату или запустите сейчас. Старый запуск сохранён.');}
function eventButton(root,text,fn,style=''){const b=document.createElement('button');b.type='button';b.className=style;b.textContent=text;b.onclick=fn;root.append(b);return b;}
function renderEvents(){
 renderedEventPhases=config.events.map(e=>e.id+':'+eventPhase(e)).join('|');
 const counts={active:0,scheduled:0,draft:0,history:eventHistory().length};for(const e of config.events){const p=eventPhase(e);if(p in counts)counts[p]++;}
 for(const b of document.querySelectorAll('[data-event-view]')){b.classList.toggle('active',b.dataset.eventView===eventView);b.setAttribute('aria-selected',String(b.dataset.eventView===eventView));b.querySelector('span').textContent=counts[b.dataset.eventView];}
 $('event-list').replaceChildren();$('event-empty').hidden=true;
 const rows=eventView==='history'?eventHistory():config.events.filter(e=>eventPhase(e)===eventView).sort((a,b)=>(a.startsAt||Infinity)-(b.startsAt||Infinity));
 if(!rows.length){$('event-empty').hidden=false;$('event-empty').textContent=({active:'Сейчас нет активных событий. Запустите шаблон или создайте новое приключение.',scheduled:'Расписание свободно. В шаблоне выберите дату начала и опубликуйте событие.',draft:'Здесь будут шаблоны. Создайте событие или повторите один из прошлых запусков.',history:'История запусков пока пуста. После остановки или повтора прежние условия и награды останутся здесь.'})[eventView];}
 for(const row of rows){
  const e=eventView==='history'?row.event:row,phase=eventView==='history'?'ended':eventPhase(e),locked=!!e.runId;
  const {root,fields}=card(e.title);root.dataset.phase=phase;root.dataset.eventId=e.id;root.classList.add('event-card');
  const status=document.createElement('p');status.className='event-status';status.textContent=phase==='active'?'● В ПРОЦЕССЕ':phase==='scheduled'?'◷ ЗАПЛАНИРОВАНО':phase==='draft'?'✧ ШАБЛОН':({ended:'ЗАВЕРШЕНО ПО ВРЕМЕНИ',stopped:'ОСТАНОВЛЕНО',removed:'УДАЛЕНО ИЗ КАТАЛОГА',restarted:'ПРЕДЫДУЩИЙ ЗАПУСК',changed:'ИЗМЕНЕНО'})[row.reason];root.prepend(status);
  const summary=document.createElement('p');summary.className='event-overview';summary.textContent=(e.runId?eventDate(e.startsAt)+' → '+eventDate(e.endsAt)+' · ':'')+'Цель: '+e.goal+' · '+e.points+' очков · '+(e.coins==null||e.coins<0?e.points:e.coins)+' монет';root.insertBefore(summary,fields);
  if(eventView==='history'){fields.remove();const info=document.createElement('p');info.textContent='Ключей: '+(e.keyCount??1)+' · Сундуков: '+(e.crateCount??1)+' · Наград-предметов: '+(e.rewards?.length||0);root.append(info);const detail=document.createElement('details'),title=document.createElement('summary'),description=document.createElement('p');title.textContent='Сохранённые условия и награды';description.textContent='Цель: '+e.target+' · Минимальный вклад: '+e.minimum+' · Лимит игрока: '+e.perPlayerCap+(e.rewards?.length?' · Предметы: '+e.rewards.map(r=>r.label+' ×'+r.count).join(', '):'');detail.append(title,description);root.append(detail);if(config.events.some(x=>x.runId===e.runId))eventButton(root,'Архивировать',()=>publishEvent(e,'delete'));eventButton(root,'Повторить событие',()=>repeatEvent(e),'primary');$('event-list').append(root);continue;}
  const detail=document.createElement('details');detail.className='event-editor';detail.open=phase==='draft';const caption=document.createElement('summary');caption.textContent=locked?'Условия и награды':'Настроить цель и награды';detail.append(caption,fields);root.append(detail);
    // Existing field builders append prize controls to the details panel.
  const append=root.append.bind(root);root.append=(...nodes)=>detail.append(...nodes);
  field(fields,'Название в шапке',e,'title',{locked});
  field(fields,'Действие',e,'kind',{locked,options:{kill:'Победить существо',craft:'Создать предмет',fish:'Поймать предмет',dimension:'Посетить измерение'}});
  field(fields,'ID цели (например minecraft:zombie)',e,'target',{locked,list:'items'});
  field(fields,'Общая цель',e,'goal',{locked,min:1,max:1000000});field(fields,'Минимальный вклад для награды',e,'minimum',{locked,min:1,max:1000000});field(fields,'Максимальный вклад одного игрока',e,'perPlayerCap',{locked,min:1,max:1000000});
  field(fields,'Очков каждому участнику',e,'points',{locked,min:0,max:10000});
  // Legacy templates reward the same number of coins as points. Normalize only before a run.
  if(!locked){e.coins=e.coins==null||e.coins<0?e.points:e.coins;e.keyCount??=1;e.crateCount??=1;e.rewards??=[];}
  field(fields,'Монет каждому участнику',e,'coins',{locked,min:0,max:100000});
  field(fields,'Редкость ключей и сундуков',e,'key',{locked,options:{'':'Без ключей и сундуков',...rarity}}).addEventListener('change',()=>{if(!e.key){e.keyCount=0;e.crateCount=0;}renderEvents();});
  field(fields,'Количество ключей',e,'keyCount',{locked,min:0,max:64});field(fields,'Количество сундуков',e,'crateCount',{locked,min:0,max:64});
  for(const r of e.rewards??[]){const prize=card('Предмет каждому участнику');field(prize.fields,'Название награды',r,'label',{locked});field(prize.fields,'Предмет — название или ID',r,'item',{locked,list:'items'}).addEventListener('change',()=>{const found=catalog.items.find(x=>x.id===r.item||x.name===r.item);if(found){r.item=found.id;renderEvents();}});field(prize.fields,'Количество',r,'count',{locked,min:1,max:64});field(prize.fields,'Редкость',r,'tier',{locked,options:{blue:'Синяя',purple:'Фиолетовая',pink:'Розовая',red:'Красная',gold:'Золотая'}});if(!locked)removeButton(prize.root,()=>{e.rewards.splice(e.rewards.indexOf(r),1);renderEvents();});root.append(prize.root);}
  if(!locked){const add=document.createElement('button');add.textContent='+ Предмет в награду';add.onclick=()=>{e.rewards.push({item:'minecraft:diamond',label:'Алмаз',count:1,tier:'blue'});changed();renderEvents();};root.append(add);}

  root.append=append;
  const actions=document.createElement('div');actions.className='event-actions';root.append(actions);
  if(locked){eventButton(actions,'Повторить',()=>repeatEvent(e));eventButton(actions,phase==='scheduled'?'Отменить запуск':'Остановить',()=>publishEvent(e,'stop'), 'danger');}
  else {
   const timing=document.createElement('div');timing.className='event-timing';root.append(timing);
   const duration=document.createElement('input');duration.type='number';duration.min=1;duration.max=10080;duration.value=60;const durationLabel=document.createElement('label');durationLabel.textContent='Длительность, минут';durationLabel.append(duration);timing.append(durationLabel);
   const date=document.createElement('input');date.type='datetime-local';date.min=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);const dateLabel=document.createElement('label');dateLabel.textContent='Начало · ваше местное время';dateLabel.append(date);timing.append(dateLabel);
   const launch=document.createElement('div');launch.className='event-actions';root.append(launch);
   eventButton(launch,'Запустить сейчас',()=>publishEvent(e,'run',Number(duration.value)),'primary');
   eventButton(launch,'Запланировать',()=>{const at=new Date(date.value).getTime();if(!Number.isFinite(at)||at<=Date.now()){message('Выберите будущую дату начала события');date.focus();return;}publishEvent(e,'run',Number(duration.value),at);});
  }
  eventButton(actions,'Удалить',()=>publishEvent(e,'delete'),'delete');$('event-list').append(root);
 }
}

let eventBusy=false;
async function publishEvent(event,action,minutes,startAt=Date.now()){
 if(eventBusy)return;
 if(action==='run'&&(!Number.isInteger(minutes)||minutes<1||minutes>10080)){message('Длительность: от 1 до 10 080 минут');return;}
 eventBusy=true;const controls=[...document.querySelectorAll('#editor button')];for(const b of controls)b.disabled=true;
 try{
  const next=structuredClone(baseline),updated=structuredClone(event);next.events=next.events.filter(e=>e.id!==event.id);
  if(action!=='delete'){updated.runId=action==='run'?newId():'';updated.startsAt=action==='run'?startAt:0;updated.endsAt=action==='run'?updated.startsAt+minutes*60000:0;next.events.unshift(updated);}
  schema.archiveRuns(next,baseline,action==='run'?'restarted':action==='stop'?'stopped':'removed');schema.validate(next,baseline);const payload=JSON.stringify(next);
  await runTransaction(db,async t=>{const current=await t.get(ref);if((current.data()?.revision||0)!==revision)throw Error('На сайте уже есть новая публикация. Сохраните черновик и обновите страницу перед управлением событием.');t.set(ref,{revision:revision+1,config:payload,updatedAt:new Date().toISOString()});});
  revision++;baseline=JSON.parse(payload);config.eventHistory=structuredClone(next.eventHistory);eventView=action==='run'?(startAt>Date.now()?'scheduled':'active'):action==='delete'?'history':'draft';config.events=config.events.filter(e=>e.id!==event.id);if(action!=='delete')config.events.unshift(updated);
  dirty=JSON.stringify(config)!==JSON.stringify(baseline);
  if(dirty)localStorage.setItem('minepass-draft-'+userId,JSON.stringify({revision,config}));else localStorage.removeItem('minepass-draft-'+userId);
  $('revision').textContent='Публикация №'+revision+(dirty?' · Остальные изменения ещё в черновике':'');renderEvents();
  message((action==='delete'?'Удаление':action==='stop'?'Остановка':'Новый запуск')+' события опубликовано, версия '+revision+'. Игра применит изменение примерно за 30–40 секунд. В одиночной игре выйдите из меню паузы. Старый завершённый запуск может оставаться в истории наград.');
 }catch(error){fail(error);}finally{eventBusy=false;for(const b of document.querySelectorAll('#editor button'))b.disabled=false;}
}
function download(value){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='published.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('login-form').onsubmit=async e=>{e.preventDefault();const button=e.currentTarget.querySelector('button');if(button.disabled)return;button.disabled=true;button.textContent='Входим…';message('Проверяем email и пароль…');try{await deadline(signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value),'Авторизация');$('password').value='';}catch(e){fail(e);}finally{button.disabled=false;button.textContent='Войти в студию';}};
$('logout').onclick=()=>signOut(auth);
let authCheck=0;
async function loadAdmin(user){
 const check=++authCheck;userId=null;dirty=false;
 $('editor').hidden=true;$('login').hidden=!!user;$('logout').hidden=!user;$('retry-login').hidden=true;
 $('account').hidden=!user;$('account').textContent=user?(user.email||'Гостевой вход'):'';
 if(!user){message('Войдите аккаунтом лаунчера, чтобы редактировать сезон.');return;}
 if(user.isAnonymous){$('login').hidden=false;message('На сайте сохранён гостевой вход. Войдите здесь через email и пароль вашего аккаунта лаунчера.');return;}
 let allowed=false;message('Вход выполнен. Проверяем права администратора…');
 try{
  const[role,member]=await deadline(Promise.all([getDoc(doc(db,'launcherAdmins',user.uid)),getDoc(doc(db,'members',user.uid))]),'Проверка прав Firebase');
  if(check!==authCheck)return;
  if(!role.data()?.enabled||member.data()?.status!=='active')throw Error('Для аккаунта '+(user.email||user.uid)+' нет активного доступа администратора. Войдите под аккаунтом администратора лаунчера.');
  allowed=true;initCosmeticsAdmin(auth);loadSecretWinner(db);initAcoin(auth);
  message('Права подтверждены. Загружаем редактор…');const published=await deadline(getDoc(ref),'Настройки Firebase');
  const base=published.exists()?JSON.parse(published.data().config):await readJSON('/assets/minepass/default.json');
  let catalogWarning=false;const nextCatalog=await readJSON('/assets/minepass/catalog.json').catch(()=>{catalogWarning=true;return {items:[],quests:[]};});
  if(check!==authCheck)return;
  userId=user.uid;baseline=base;revision=published.data()?.revision||0;config=structuredClone(baseline);catalog=nextCatalog;
  let draftWarning=false;try{const draft=localStorage.getItem('minepass-draft-'+userId);if(draft){const saved=JSON.parse(draft);if(saved.revision===revision){schema.validate(saved.config,baseline);config=saved.config;dirty=true;}}}catch{draftWarning=true;}
  schema.validate(baseline);lists();renderLoot();renderQuests();renderEvents();$('editor').hidden=false;
  $('revision').textContent=`Публикация №${revision}${dirty?' · Восстановлен черновик':''}`;
  message('Редактор готов. Изменения применятся после публикации.'+(draftWarning?' Старый черновик не удалось открыть; загружена опубликованная версия. Черновик сохранён в браузере.':'')+(catalogWarning?' Список предметов временно недоступен; можно вводить ID вручную.':''));
 }catch(e){if(check!==authCheck)return;userId=null;$('retry-login').hidden=false;if(!allowed)$('login').hidden=false;fail(e);}
}
onAuthStateChanged(auth,loadAdmin,error=>{fail(error);$('login').hidden=false;});
$('retry-login').onclick=()=>loadAdmin(auth.currentUser);
for(const b of document.querySelectorAll('[data-event-view]'))b.onclick=()=>{eventView=b.dataset.eventView;renderEvents();};
$('chest').onchange=renderLoot;$('search').oninput=renderQuests;
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>{for(const x of document.querySelectorAll('[data-tab]')){const active=x===b;x.classList.toggle('active',active);$(x.dataset.tab).hidden=!active;}};
const newId=()=>crypto.randomUUID().replaceAll('-','');
$('add-event').onclick=()=>{eventView='draft';config.events.unshift({id:newId(),title:'Общая охота',kind:'kill',target:'minecraft:zombie',goal:50,minimum:5,perPlayerCap:50,points:200,coins:200,key:'rare',keyCount:1,crateCount:1,rewards:[],runId:'',startsAt:0,endsAt:0});changed();renderEvents();};
$('add-loot').onclick=()=>{config.chests[$('chest').value].push({id:newId(),label:'Новая награда',item:'minecraft:diamond',key:'',tier:'blue',count:1,weight:10,points:0,coins:0});changed();renderLoot();};
$('add-quest').onclick=()=>{config.quests.unshift({id:newId(),title:'Новое задание',kind:'external',target:'ftbquests:',goal:1,points:100,key:'common'});$('search').value='';changed();renderQuests();};
$('save').onclick=()=>{localStorage.setItem('minepass-draft-'+userId,JSON.stringify({revision,config}));message('Черновик сохранён в этом браузере. В игру он ещё не отправлен.');};
$('export').onclick=()=>{try{schema.validate(config,baseline);download({revision:revision+1,config});message('Скачаны настройки для ручной установки. Не смешивайте ручные версии с публикациями сайта.');}catch(e){fail(e);}};
for(const type of ['import','catalog'])$(type).onchange=async()=>{try{const file=$(type).files[0];if(!file)return;if(file.size>5000000)throw Error('Файл слишком большой');const value=JSON.parse(await file.text());if(type==='catalog'){if(!Array.isArray(value.items)||!Array.isArray(value.quests))throw Error('Нужен catalog.json из игры');catalog=value;lists();message(`Загружено: ${value.items.length} предметов и ${value.quests.length} заданий FTB.`);}else{schema.validate(value.config,baseline);config=value.config;changed();renderLoot();renderQuests();renderEvents();}}catch(e){fail(e);}finally{$(type).value='';}};
$('publish').onclick=async()=>{const b=$('publish');b.disabled=true;try{schema.archiveRuns(config,baseline);schema.validate(config,baseline);const payload=JSON.stringify(config);await runTransaction(db,async t=>{const current=await t.get(ref);if((current.data()?.revision||0)!==revision)throw Error('Другой администратор уже опубликовал изменения. Сохраните черновик и перезагрузите страницу.');t.set(ref,{revision:revision+1,config:payload,updatedAt:new Date().toISOString()});});revision++;baseline=JSON.parse(payload);dirty=JSON.stringify(config)!==payload;localStorage.removeItem('minepass-draft-'+userId);$('revision').textContent=`Публикация №${revision}${dirty?' · Есть новые неопубликованные изменения':''}`;renderQuests();renderEvents();message(`Версия ${revision} опубликована. Мод получит её в течение 30 секунд; открытый мир применит ещё в течение 10 секунд. Закрытые миры обновятся при следующем запуске.`);}catch(e){fail(e);}finally{b.disabled=false;}};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
// Refresh categories only across a status boundary and never while editing.
setInterval(()=>{if(!config||eventView==='draft'||document.querySelector('#event-list input:focus'))return;if(config.events.map(e=>e.id+':'+eventPhase(e)).join('|')!==renderedEventPhases)renderEvents();},10000);
