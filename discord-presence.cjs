// Separate lightweight worker: does not reactivate the disabled Minecraft/Discord bridge.
const fs=require('fs'),path=require('path');
const lock=path.join(__dirname,'.discord-presence.pid');
const singleton=require('node:net').createServer(socket=>socket.destroy());
singleton.on('error',error=>{console.error(error.code==='EADDRINUSE'?'Presence worker already running':'Presence lock failed');process.exitCode=1;});
singleton.listen('\\\\.\\pipe\\astral-presence-counter',()=>{
fs.writeFileSync(lock,String(process.pid));process.on('exit',()=>{try{if(fs.readFileSync(lock,'utf8')===String(process.pid))fs.unlinkSync(lock);}catch{}});
for(const line of fs.readFileSync(path.join(__dirname,'.env'),'utf8').split(/\r?\n/)){const m=line.match(/^([A-Z_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');}
const {Client,GatewayIntentBits,ChannelType,PermissionFlagsBits}=require('discord.js'),admin=require('firebase-admin');
admin.initializeApp({credential:admin.credential.cert(require('./serviceAccountKey.json')),databaseURL:'https://astral-524a1-default-rtdb.europe-west1.firebasedatabase.app'});
const client=new Client({intents:[GatewayIntentBits.Guilds]}),state=path.join(__dirname,'.discord-presence-channel.json');
let busy=false,channel,nextRename=0;
// The public counter must keep updating even while Discord is unavailable.
update();setInterval(update,30000);
async function update(){if(busy)return;busy=true;try{const snap=await admin.database().ref('packPresence').orderByChild('seen').startAt(Date.now()-90000).limitToLast(1000).once('value');const count=Object.values(snap.val()||{}).filter(v=>v.seen>Date.now()-90000).length;await admin.database().ref('packOnline').set({count,updatedAt:Date.now()});const name='✦ В сборке: '+count;if(channel&&channel.name!==name&&Date.now()>=nextRename){nextRename=Date.now()+6*60*1000;await channel.setName(name,'Онлайн игроков Astral');}console.log(new Date().toISOString(),'ONLINE',count);}catch(e){console.error('Online update failed:',e.message);}finally{busy=false;}}
client.once('ready',async()=>{try{
 const anchor=await client.channels.fetch(process.env.DISCORD_MINEPASS_CHANNEL_ID||'1510630138453164079');const guild=anchor.guild;
 if(fs.existsSync(state)){const saved=JSON.parse(fs.readFileSync(state));channel=await guild.channels.fetch(saved.id).catch(()=>null);}
 if(!channel){const channels=await guild.channels.fetch();channel=channels.find(c=>c?.type===ChannelType.GuildVoice&&c.name.startsWith('✦ В сборке:'));}
 if(!channel)channel=await guild.channels.create({name:'✦ В сборке: …',type:ChannelType.GuildVoice,permissionOverwrites:[{id:guild.id,deny:[PermissionFlagsBits.Connect]}],reason:'Счётчик игроков Astral по запросу владельца'});
 fs.writeFileSync(state,JSON.stringify({id:channel.id,guild:guild.id}));console.log('PRESENCE_CHANNEL_READY',channel.id);await update();
 }catch(e){console.error('Discord presence unavailable:',e.message);client.destroy();}});
client.on('error',e=>console.error('Discord connection:',e.message));client.login(process.env.DISCORD_BOT_TOKEN).catch(e=>{console.error(e.message);process.exitCode=1;});

});
