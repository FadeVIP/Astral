(function(root){
 'use strict';
 const keys=['common','rare','epic'],tiers=['blue','purple','pink','red','gold'],id=/^[a-z0-9_-]{1,64}$/,item=/^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
 function validate(c,previous){
  const check=(v,m)=>{if(!v)throw Error(m);},num=(n,a,b)=>Number.isSafeInteger(n)&&n>=a&&n<=b,str=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
  check(c&&c.schema===1&&id.test(c.season)&&num(c.pointsPerLevel,1,100000)&&num(c.maxLevel,1,100),'Некорректный сезон');
  check(str(c.title,120),'Укажите название сезона');
  check(Array.isArray(c.quests)&&c.quests.length>0&&c.quests.length<=500,'Нужно от 1 до 500 заданий');
  let ids=new Set(),external=new Set();
  for(const q of c.quests){check(id.test(q.id)&&!ids.has(q.id)&&str(q.title,150)&&['kill','craft','fish','dimension','external'].includes(q.kind)&&item.test(q.target)&&num(q.goal,1,100000)&&num(q.points,1,10000)&&keys.includes(q.key),'Проверьте задание «'+(q.title||q.id)+'»');ids.add(q.id);
   if(q.kind==='external'){check(/^ftbquests:[0-9a-f]{16}$/.test(q.target)&&q.goal===1&&!external.has(q.target),'Выберите уникальное задание FTB Quests');external.add(q.target);}
   const old=previous?.quests.find(x=>x.id===q.id);if(old)check(q.kind===old.kind&&q.target===old.target&&q.goal===old.goal,'Для изменения условия создайте новое задание: '+q.title);
  }
  for(const key of keys){const rows=c.chests?.[key];check(Array.isArray(rows)&&rows.length>0&&rows.length<=100,'В каждом сундуке нужна хотя бы одна награда');ids=new Set();for(const r of rows){check(id.test(r.id)&&!ids.has(r.id)&&str(r.label,100)&&tiers.includes(r.tier)&&num(r.weight,1,100000)&&num(r.count,1,64)&&num(r.points,0,10000)&&num(r.coins,0,100000)&&typeof r.item==='string'&&(r.item===''||item.test(r.item))&&typeof r.key==='string'&&(r.key===''||keys.includes(r.key))&&(r.item||r.key||r.points||r.coins),'Проверьте награду «'+(r.label||r.id)+'»');ids.add(r.id);}}
  check(Array.isArray(c.shop)&&Array.isArray(c.events),'Отсутствуют магазин или события');
  check(c.events.length<=50,'Можно добавить до 50 событий');ids=new Set();const runs=new Set();
  for(const e of c.events){
   check(id.test(e.id)&&!ids.has(e.id)&&str(e.title,120)&&['kill','craft','fish','dimension'].includes(e.kind)&&/^[a-z0-9_.-]+:(?:[a-z0-9_./-]+|\*)$/.test(e.target)&&num(e.goal,1,1000000)&&num(e.minimum,1,e.goal)&&num(e.perPlayerCap,e.minimum,1000000)&&num(e.points,0,10000)&&num(e.coins??-1,-1,100000)&&['',...keys].includes(e.key)&&num(e.keyCount??1,0,64)&&num(e.crateCount??1,0,64),'Проверьте событие «'+(e.title||e.id)+'»');ids.add(e.id);
   check(e.key!==''||((e.keyCount??1)===0&&(e.crateCount??1)===0),'Для ключей и сундуков выберите редкость');
   if(e.runId){check(id.test(e.runId)&&!runs.has(e.runId)&&num(e.startsAt,1,9007199254740991)&&num(e.endsAt,e.startsAt+1,e.startsAt+604800000),'Некорректный запуск события');runs.add(e.runId);}
   const rewards=e.rewards??[];check(Array.isArray(rewards)&&rewards.length<=20,'До 20 предметов в награде события');
   for(const r of rewards)check(item.test(r.item)&&str(r.label,100)&&num(r.count,1,64)&&tiers.includes(r.tier),'Проверьте предмет события «'+e.title+'»');
   const old=previous?.events.find(x=>x.id===e.id);
   if(old?.runId&&e.runId===old.runId)for(const key of ['title','kind','target','goal','minimum','perPlayerCap','points','coins','key','keyCount','crateCount','startsAt','endsAt','rewards'])check(JSON.stringify(e[key])===JSON.stringify(old[key]),'Для изменения запущенного события сначала остановите его: '+e.title);
  }
  if(c.eventHistory!==undefined){check(Array.isArray(c.eventHistory)&&c.eventHistory.length<=100,'История: до 100 запусков');for(const h of c.eventHistory){check(h&&h.event?.runId&&num(h.archivedAt,1,9007199254740991)&&['restarted','stopped','removed','changed'].includes(h.reason),'Некорректная запись истории');validate({...c,eventHistory:undefined,events:[h.event]});}}
  if(previous)check(c.season===previous.season,'Смена сезона отключена: прогресс мира должен сохраниться');
  check(JSON.stringify(c).length<600000,'Настройки слишком большие');return c;
 }
 function archiveRuns(next,previous,reason='changed',now=Date.now()){
  const history=structuredClone(previous?.eventHistory||[]);
  for(const event of previous?.events||[])if(event.runId&&!next.events.some(e=>e.runId===event.runId)&&!history.some(h=>h.event.runId===event.runId))history.unshift({event:structuredClone(event),archivedAt:now,reason});
  next.eventHistory=history.slice(0,100);return next;
 }
 const api={validate,keys,tiers,archiveRuns};if(typeof module!=='undefined')module.exports=api;else root.MinePassSchema=api;
})(globalThis);
