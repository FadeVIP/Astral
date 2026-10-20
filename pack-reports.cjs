'use strict';
const {createHash}=require('node:crypto');
const ZONE='Europe/Berlin';
function shift(day,n){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
// Buckets end at 21:00 local time, including across daylight-saving transitions.
function period(now){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now)).map(x=>[x.type,x.value]));const day=`${p.year}-${p.month}-${p.day}`;return Number(p.hour)<21?day:shift(day,1);}
function summary(days,end,length){const ids=new Set();let peak=0;for(let i=0;i<length;i++){const row=days[shift(end,-i)];for(const id of Object.keys(row?.visitors||{}))ids.add(id);peak=Math.max(peak,row?.peak||0);}return {count:ids.size,peak};}
function report(days,end,length,started){const current=summary(days,end,length),previous=summary(days,shift(end,-length),length);const complete=started<shift(end,1-length),priorComplete=started<shift(end,1-2*length);const delta=current.count-previous.count;return {embeds:[{title:length===1?'📊 Активность сборок за сутки':'📊 Активность сборок за неделю',color:0xbda0f5,description:`Период: ${shift(end,-length)} 21:00 — ${end} 21:00 (Берлин)\n${complete?'':'Первый период неполный: сбор истории начался недавно.\n'}Все сборки с поддержкой онлайна Astral.`,fields:[{name:'Активные установки',value:String(current.count),inline:true},{name:'Пиковый онлайн',value:String(current.peak),inline:true},{name:'К предыдущему периоду',value:priorComplete?`${delta>=0?'+':''}${delta}`:'Недостаточно истории',inline:true}],footer:{text:'Учитываются установки игры, а не уникальные люди. Один игрок в разных сборках может учитываться несколько раз.'}}],allowedMentions:{parse:[]}};}
function start(db,client){
 const state={channelId:null,lastReport:null};if(!db)return state;
 const pending=new Map();let busy=false,channel;
 const observe=s=>{const row=s.val(),now=Date.now();if(row?.pack!=='astral-1.20.1'||!Number.isFinite(row.seen)||row.seen<now-90000||row.seen>now+10000)return;const key=period(row.seen);if(!pending.has(key))pending.set(key,new Set());pending.get(key).add(createHash('sha256').update(s.key).digest('hex'));};
 db.ref('packPresence').on('child_added',observe,()=>{});db.ref('packPresence').on('child_changed',observe,()=>{});
 async function tick(){if(busy||!client.isReady())return;busy=true;try{
  const now=Date.now(),active=period(now),root=db.ref('packReportsPrivate');
  const metaResult=await root.child('meta').transaction(v=>v||{started:active,lastDaily:shift(active,-1),lastWeekly:shift(active,-1)});const meta=metaResult.snapshot.val();
  const online=(await db.ref('packOnline').once('value')).val();
  if(!pending.has(active))pending.set(active,new Set());
  for(const [day,ids] of [...pending]){const captured=[...ids];await root.child('days/'+day).transaction(v=>({visitors:{...v?.visitors,...Object.fromEntries(captured.map(id=>[id,true]))},peak:Math.max(v?.peak||0,day===active&&now-online?.updatedAt<90000?online.count:0)}));for(const id of captured)ids.delete(id);if(!ids.size)pending.delete(day);}
  if(!channel){const anchor=await client.channels.fetch(process.env.DISCORD_PRESENCE_CHANNEL_ID||'1551670534285172911');if(meta.channelId)channel=await anchor.guild.channels.fetch(meta.channelId).catch(()=>null);if(!channel){const all=await anchor.guild.channels.fetch();channel=all.find(c=>c?.type===0&&c.name==='статистика-сборок');}if(!channel)channel=await anchor.guild.channels.create({name:'статистика-сборок',type:0,parent:anchor.parentId,topic:'Ежедневные отчёты в 21:00, недельные — по воскресеньям. Europe/Berlin. Активность установок сборок Astral.',reason:'Отчёты об активности по запросу владельца'});await root.child('meta/channelId').set(channel.id);state.channelId=channel.id;}
  const days=(await root.child('days').once('value')).val()||{};
  const end=shift(active,-1);
  for(let day=shift(meta.lastDaily,1);day<=end;day=shift(day,1)){
   for(const length of [1,7]){if(length===7&&new Date(day+'T12:00:00Z').getUTCDay()!==0)continue;
    const key=`${length}-${day}`,ref=root.child('sent/'+key);if((await ref.once('value')).exists())continue;
    // Stable marker recovers a send that succeeded just before a process crash.
    const payload=report(days,day,length,meta.started);payload.content=`Отчёт Astral · ${key}`;
    const recent=await channel.messages.fetch({limit:100});const existing=recent.find(m=>m.author.id===client.user.id&&m.content===payload.content);
    const message=existing||await channel.send(payload);await ref.set({id:message.id,at:Date.now()});state.lastReport=key;
   }
   await root.child('meta/lastDaily').set(day);
  }
  // Anonymous identifiers are retained only long enough for weekly comparisons.
  const expired=Object.keys(days).filter(d=>d<shift(active,-35));if(expired.length)await root.child('days').update(Object.fromEntries(expired.map(d=>[d,null])));
 }catch(e){console.error('[Reports] Update unavailable:',e.code||'request failed');}finally{busy=false;}}
 tick();const timer=setInterval(tick,30000);timer.unref();return state;
}
module.exports={start,period,shift,summary,report};
