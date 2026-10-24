'use strict';
const {createHash}=require('node:crypto');
const ZONE='Europe/Berlin';
function dayKey(time){return new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));}
function mergeDaily(previous,day,ids){
 const visitors=previous?.day===day?{...previous.visitors}:{};
 for(const id of ids)visitors[id]=true;
 return {day,visitors,count:Object.keys(visitors).length,timeZone:ZONE};
}
function start(db,client){
 const state={count:null,updatedAt:0,dailyCount:null,dailyDay:null};
 let busy=false,channel,dailyChannel,nextRename=0;
 const pending=new Map();
 const hash=id=>createHash('sha256').update(id).digest('hex');
 // Capture short visits even when the player leaves before the next aggregate update.
 if(db){
  const observe=snapshot=>{const row=snapshot.val(),now=Date.now();
   if(row?.pack==='astral-1.20.1'&&Number.isFinite(row.seen)&&row.seen<=now+10000&&dayKey(row.seen)===dayKey(now))pending.set(hash(snapshot.key),dayKey(now));
  };
  const presence=db.ref('packPresence');
  if(typeof presence.on==='function'){
   presence.on('child_added',observe,()=>console.error('[Online] Daily listener unavailable'));
   presence.on('child_changed',observe,()=>console.error('[Online] Daily listener unavailable'));
  }
 }
 async function update(){
  if(busy||!db)return;busy=true;
  try{
   const now=Date.now(),day=dayKey(now),snap=await db.ref('packPresence').orderByChild('seen').startAt(now-90000).limitToLast(1000).once('value');
   const live=Object.entries(snap.val()||{}).filter(([,v])=>Number.isFinite(v.seen)&&v.seen>now-90000&&v.seen<=now+10000);
   const count=live.length;
   await db.ref('packOnline').set({count,updatedAt:now,source:process.env.RENDER?'render-bot':'bot'});
   state.count=count;state.updatedAt=now;
   // Admin-only storage; retain only the current day's anonymous identifiers.
   const captured=[...pending].filter(([,d])=>d===day).map(([id])=>id);
   const ids=[...new Set([...captured,...live.map(([id])=>hash(id))])];
   try{
    const result=await db.ref('packDailyPrivate').transaction(previous=>mergeDaily(previous,day,ids));
    if(result.committed){
     const daily=result.snapshot.val();state.dailyCount=daily.count;state.dailyDay=daily.day;
     for(const [id,d] of pending)if(d!==day||captured.includes(id))pending.delete(id);
    }
   }catch(e){console.error('[Online] Daily counter unavailable:',e.code||'request failed');}
   if(client.isReady()&&now>=nextRename){
    nextRename=now+360000;
    try{
     channel=channel||await client.channels.fetch(process.env.DISCORD_PRESENCE_CHANNEL_ID||'1551670534285172911');
     const name='✦ В сборке: '+count;
     if(channel&&channel.name!==name)await channel.setName(name,'Онлайн игроков Astral');
    }catch(e){console.error('[Online] Discord counter unavailable:',e.code||'request failed');}
    if(channel&&state.dailyDay===day&&state.dailyCount!==null)try{
     const {ChannelType,PermissionFlagsBits}=require('discord.js');
     if(!dailyChannel){
      const saved=(await db.ref('packDailyChannel').once('value')).val();
      if(saved?.id)dailyChannel=await channel.guild.channels.fetch(saved.id).catch(()=>null);
      if(!dailyChannel){const channels=await channel.guild.channels.fetch();dailyChannel=channels.find(c=>c?.type===ChannelType.GuildVoice&&c.name.startsWith('✦ За сегодня:'));}
      if(!dailyChannel)dailyChannel=await channel.guild.channels.create({name:'✦ За сегодня: '+state.dailyCount,type:ChannelType.GuildVoice,parent:channel.parentId,permissionOverwrites:[{id:channel.guild.id,deny:[PermissionFlagsBits.Connect]}],reason:'Суточный счётчик Astral по запросу владельца'});
      await db.ref('packDailyChannel').set({id:dailyChannel.id});
     }
     const name='✦ За сегодня: '+state.dailyCount;
     if(dailyChannel.name!==name)await dailyChannel.setName(name,'Уникальные установки за сегодня · Europe/Berlin');
    }catch(e){console.error('[Online] Discord daily counter unavailable:',e.code||'request failed');}
   }
  }catch(e){console.error('[Online] Firebase counter unavailable:',e.code||'request failed');}finally{busy=false;}
 }
 update();const timer=setInterval(update,30000);timer.unref();return state;
}
module.exports={start,dayKey,mergeDaily};
