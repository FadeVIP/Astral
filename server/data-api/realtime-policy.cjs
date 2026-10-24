'use strict';
const {DataError,ROOT}=require('./store.cjs');
const {unpack}=require('./policy.cjs');
const {pathParts}=require('./realtime-store.cjs');
const deny=()=>{throw new DataError(403,'Permission denied');};
const text=(v,max)=>typeof v==='string'&&v.length<=max;
async function actor(user,documents,get=async()=>null){
 if(!user)return {uid:null,admin:false};
 const member=unpack(await documents.get('members/'+user.uid));
 const confirmed=!!user.email&&user.firebase?.sign_in_provider!=='anonymous';
 const assigned=async root=>confirmed&&Object.values(await get(root)||{}).some(r=>r?.uid===user.uid);
 const admin=confirmed&&member?.status==='active'&&unpack(await documents.get('launcherAdmins/'+user.uid))?.enabled===true||await assigned('admins');
 return {uid:user.uid,admin,moderator:admin||await assigned('moderators'),nickname:member?.nickname?.toLowerCase(),active:member?.status==='active'};
}
async function canReadRealtime(path,c,get){
 const [root,key,uid]=pathParts(path);
 if(['publicLauncherData','publicGameData','packOnline','chat','chat_settings','presence','participants','admins','moderators','muted','banned','counters','tickets'].includes(root))return true;
 if(root==='minepass'&&key==='announcements')return true;
 if(c.admin)return true;
 if(!c.uid)return false;
 if(root==='socialDirectory'&&['lists','sessions'].includes(key)&&uid===c.uid&&await get('socialDirectory/active/'+c.uid)===true)return true;
 if(root==='socialPresence'&&key){const owner=await get('socialDirectory/names/'+key);return owner?.active===true&&(owner.uid===c.uid||await get('socialDirectory/access/'+c.uid+'/'+key)===true);}
 if(root==='discord_links'&&key)return (await get(path))?.uid===c.uid;
 return false;
}
async function authorizeRealtime(c,{path,old,next,now,get}){
 const parts=pathParts(path),[root,key]=parts;
 // Derived projections, rewards and statistics can only be written by the
 // trusted server adapter; even a website administrator cannot forge balances.
 if(['publicLauncherData','publicGameData','socialDirectory','packOnline','packDailyPrivate','packReportsPrivate','packDailyChannel','minepass'].includes(root))deny();
 if(!c.uid)deny();
 if(root==='counters'&&parts.length===2&&['views','downloads'].includes(key)&&Number.isSafeInteger(next)&&next===(old||0)+1&&next<Number.MAX_SAFE_INTEGER)return;
 if(root==='packPresence'&&key===c.uid&&parts.length===2){
  if(next===null)return;
  if(Object.keys(next).some(k=>!['seen','pack'].includes(k))||next.pack!=='astral-1.20.1'||!Number.isFinite(next.seen)||Math.abs(next.seen-now)>10000)deny();return;
 }
 if(root==='socialPresence'&&parts.length===2){
  const owner=await get('socialDirectory/names/'+key);if(owner?.uid!==c.uid||!owner.active)deny();if(next===null)return;
  if(Object.keys(next).some(k=>!['pack','playing','updatedAt'].includes(k))||!text(next.pack,64)||typeof next.playing!=='boolean'||next.updatedAt!==now)deny();return;
 }
 if(['admins','moderators','banned','muted','chat_settings','counters'].includes(root)){
  if(!c.admin&&!(c.moderator&&['banned','muted'].includes(root)))deny();
  if(next&&key&&['admins','moderators','banned','muted'].includes(root)){
   const target=await get('participants/'+key);if(target?.uid)next.uid=target.uid;
   if(['admins','moderators'].includes(root)&&!next.uid)deny();
  }return;
 }
 if(root==='participants'&&parts.length===2){
  if(c.admin)return;
  if(next===null||next.uid!==c.uid||(old?.uid&&old.uid!==c.uid))deny();
  if(next.isAdmin||next.isModerator&&!c.moderator||!['user','guest',...(c.moderator?['moderator']:[])].includes(next.role)||!text(next.name,64))deny();return;
 }
 if(root==='presence'&&parts.length===2){if(next===null){if(old&&old.uid!==c.uid&&!c.admin)deny();return;}if(next.uid!==c.uid||(old?.uid&&old.uid!==c.uid)||!(text(next.name,64)||next.active===true))deny();return;}
 if(root==='chat'){
  if(c.admin||c.moderator)return;
  if(parts.length!==2)deny();
  if(next===null){if(old?.uid!==c.uid)deny();return;}
  if(next.uid!==c.uid||(old&&old.uid!==c.uid)||!text(next.text,10000)||!text(next.author,64)||next.isAdmin||next.isModerator||next.fromDiscord||next.source==='discord')deny();
  if(!Number.isFinite(next.ts)||(!old&&Math.abs(now-next.ts)>86400000)||old&&old.ts!==next.ts)deny();
  for(const bucket of ['banned','muted'])if(Object.values(await get(bucket)||{}).some(v=>v?.uid===c.uid&&(!v.expiresAt||v.expiresAt>now)))deny();return;
 }
 if(root==='tickets'){if(c.admin||c.moderator&&next!==null)return;if(parts.length!==2||!next||next.uid!==c.uid||old&&old.uid!==c.uid)deny();if(old&&JSON.stringify(next.replies??null)!==JSON.stringify(old.replies??null)||!old&&(next.replies||!text(next.text,10000)||!text(next.title,200)))deny();return;}
 if(root==='discord_links'&&parts.length===2&&!old&&next?.uid===c.uid)return;
 deny();
}
module.exports={actor,canReadRealtime,authorizeRealtime};
